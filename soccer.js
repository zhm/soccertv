var sys = require('sys'),
	fs = require('fs'),
	http = require('http'),
	Table = require('cli-table'),
	jsdom = require('jsdom'),
	request = require('request');


var filter = process.argv[2];

// hax for some shortcuts
filter = filter ? filter.toLowerCase() : '';
if (filter == 'epl') filter = 'england premier league';
if (filter == 'mls') filter = 'major league soccer';
if (filter == 'web') filter = 'foxsoccer.tv';


Soccer = {
	CACHE_DIR: 'cache/',
	MATCH_URL: 'http://www.livesoccertv.com/schedules/',
	MATCH_DAYS: 28,
	allMatches: [],
	beginDate: new Date(),
	
	fetchContent: function(url, callback) {
		request({uri: url}, function (error, response, body) {
			callback(body);
		});
	},
	
	//hacky, but it'll work for now
	formatDateForMatchDay: function(date) {
		return date.getFullYear() + '-' + 
			((date.getMonth()+1) > 9 ? (date.getMonth()+1) : '0' + (date.getMonth()+1)) + '-' + 
			(date.getDate() > 9 ? date.getDate() : '0' + date.getDate());
	},
	
	cachePathForDate: function(date) {
		return Soccer.CACHE_DIR + Soccer.formatDateForMatchDay(date) + '.cache';
	},
	
	jsonPathForDate: function(date) {
		return Soccer.CACHE_DIR + Soccer.formatDateForMatchDay(date) + '.json';
	},
	
	//nodejs doesn't have a quick way to do this synchronously
	fileExists: function(path) {
		return (function() { 
			try { 
				return fs.statSync(path).isFile();
			} catch (ex) { 
				return false; 
			}
		})();
	},
	
	// after implementing this I realized I only need to cache the parsed json, but I'll leave it in for now
	fetchMarkupIfNeeded: function(date, callback) {
		var cachePath = Soccer.cachePathForDate(date);
		var cacheExists = Soccer.fileExists(cachePath);

		if (!cacheExists) {
			var url = Soccer.MATCH_URL + Soccer.formatDateForMatchDay(date);

			Soccer.fetchContent(url, function(body) {
				try { fs.mkdirSync('./cache', 0777); } catch (ex) {}
				try { fs.writeFileSync(cachePath, body); } catch (ex) {}
				callback();
			});
		} else {
			callback();
		}
	},
	
	//don't even get me started...
	addDays: function(date, days) {
		return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
	},
	
	getMatches: function() {
		Soccer.beginDate = new Date();
		Soccer.endDate = Soccer.addDays(Soccer.beginDate, Soccer.MATCH_DAYS - 1);
		Soccer._getMatches(Soccer.beginDate, Soccer.matchCallback);
	},
	
	// gets the matches for the given day and passes them to the callback function when they're parsed from cache
	_getMatches: function(matchDate, callback) {
		var matches = [];

		var jsonPath = Soccer.jsonPathForDate(matchDate);
		var jsonExists = Soccer.fileExists(jsonPath);

		if (!jsonExists) {
			console.log('One sec... fetching/parsing/caching match data for ' + matchDate.toLocaleDateString() + '...');

			Soccer.fetchMarkupIfNeeded(matchDate, function() {
				var cachePath = Soccer.cachePathForDate(matchDate);
				var cacheData = fs.readFileSync(cachePath, 'utf8');

				//super fragile html parsing!
				jsdom.env({
					html: cacheData,
					scripts: ['http://code.jquery.com/jquery-1.5.min.js'],
					done: function(errors, window) {
						var $ = window.$;
						var pastMatches = [];

						$('.tab_container > div > table > tr').each(function(index, obj) {
							if (index == 1) {
								$('td > table > tr', obj).each(function(index, row) {

									//the page for the current day has an extra nested section
									if (index == 1 && matchDate.toDateString() == (new Date()).toDateString()) {
										$('td > div > table > tr', row).each(function(index, cell) {
											var match = { date: matchDate.toDateString() };
											$('td', cell).each(function(index, cell) {
												if (index == 0) match.time = $.trim($(cell).text());
												if (index == 1) match.desc = $.trim($(cell).text());
												if (index == 2) match.chan = $.trim($(cell).text());
												if (index == 3) match.live = $.trim($(cell).text());
												if (index == 4) match.type = $.trim($(cell).text());
											});

											if (match.time) {
												matches.push(match);
												pastMatches.push(match);
											}
										});
									} else if (index > 1) {
										var match = { date: matchDate.toDateString() };
										$('td', row).each(function(index, cell) {
											if (index == 0) match.time = $.trim($(cell).text());
											if (index == 1) match.desc = $.trim($(cell).text());
											if (index == 2) match.chan = $.trim($(cell).text());
											if (index == 3) match.live = $.trim($(cell).text());
											if (index == 4) match.type = $.trim($(cell).text());
										});

										if (match.time) {
											matches.push(match);
										}
									}
								});
							}
						});

						//cache the parsed array so we don't have to spin up a jsdom.env every time
						try { fs.mkdirSync('./cache', 0777); } catch (ex) {}
						try { fs.writeFileSync(jsonPath, JSON.stringify(matches, null, '\t')); } catch (ex) {}

						callback(matches, matchDate);
					}

				});

			});
		} else {
			matches = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
			callback(matches, matchDate);
		}
	},
	
	//this is the callback used to handle results coming from getMatches (jsdom is all async)
	matchCallback: function(matches, date) {
		Soccer.allMatches = Soccer.allMatches.concat(matches);

		//see if we have all the matches yet, if not, keep on truckin'
		if (date < Soccer.endDate) {
			Soccer._getMatches(Soccer.addDays(date, 1), Soccer.matchCallback);
		} else {
			Soccer.printMatches();
		}
	},
	
	printMatches: function() {
		var table = new Table({
			head: ['Date', 'Time', 'Match', 'Channel', 'League'], 
			colWidths: [17, 9, 50, 50, 30]
		});

		var matchCount = 0;

		Soccer.allMatches.forEach(function(match, index) {
			//for now, just hard code this, needs more filters!
			if (match.live == 'Live') {
				if (filter) {
					if (match.desc.toLowerCase().indexOf(filter) > -1 ||
						match.chan.toLowerCase().indexOf(filter) > -1 ||
						match.live.toLowerCase().indexOf(filter) > -1 ||
						match.type.toLowerCase().indexOf(filter) > -1)
					{
						table.push([match.date, match.time, match.desc + ' (' + match.live + ')', match.chan, match.type]);
						matchCount++;
					}
				} else {
					table.push([match.date, match.time, match.desc + ' (' + match.live + ')', match.chan, match.type]);
					matchCount++;
				}
			}
		});

		console.log(table.toString());
		console.log('Showing ' + matchCount + ' of ' + Soccer.allMatches.length + ' matches');
	}
};


Soccer.getMatches();