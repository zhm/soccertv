var sys = require('sys'),
	fs = require('fs'),
	http = require('http'),
	libxmljs = require("libxmljs"),
	Table = require('cli-table'),
	jsdom = require('jsdom'),
	request = require('request');
	

var filter = process.argv[2];

// hacks for some shortcuts
filter = filter ? filter.toLowerCase() : '';
if (filter == 'epl') filter = 'england premier league';
if (filter == 'mls') filter = 'major league soccer';
if (filter == 'web') filter = 'foxsoccer.tv';


function getPage(url, callback) {
	request({uri: url}, function (error, response, body) {
		callback(body);
	});
}

//hacky, but it works
function formatDateForMatchDay(date) {
	return date.getFullYear() + '-' + 
		((date.getMonth()+1) > 9 ? (date.getMonth()+1) : '0' + (date.getMonth()+1)) + '-' + 
		(date.getDate() > 9 ? date.getDate() : '0' + date.getDate());
}

function cachePathForDate(date) {	
	return 'cache/' + formatDateForMatchDay(date) + '.cache';
}

function jsonPathForDate(date) {	
	return 'cache/' + formatDateForMatchDay(date) + '.json';
}


function fileExists(path) {
	return (function() { 
		try { 
			return fs.statSync(path).isFile();
		} catch (ex) { 
			return false; 
		}
	})();
}

function cacheMatchIfNeeded(date, callback) {
	var cachePath = cachePathForDate(date);
	var cacheExists = fileExists(cachePath);
	
	if (!cacheExists) {
		var url = 'http://www.livesoccertv.com/schedules/' + formatDateForMatchDay(date);

		getPage(url, function(body) {
			try { fs.mkdirSync('./cache', 0777); } catch (ex) {}
			try { fs.writeFileSync(cachePath, body); } catch (ex) {}
			callback();
		});
	} else {
		callback();
	}
}

function getMatches(today, callback) {
	var matches = [];
	
	var jsonPath = jsonPathForDate(today);
	var jsonExists = fileExists(jsonPath);

	if (!jsonExists) {
		console.log('fetching/parsing/caching match data for ' + today.toLocaleDateString() + '... one sec...');
		
		cacheMatchIfNeeded(today, function() {
			var cachePath = cachePathForDate(today);
			var cacheData = fs.readFileSync(cachePath, 'utf8');

			jsdom.env({
			  html: cacheData,
			  scripts: ['http://code.jquery.com/jquery-1.5.min.js'],
			  done: function(errors, window) {
			    var $ = window.$;
				var pastMatches = [];

			    $('.tab_container > div > table > tr').each(function(index, obj) {
					if (index == 1) {
						$('td > table > tr', obj).each(function(index, row) {

							//the page for the current day has an extra newsted section
							if (index == 1 && today.toDateString() == (new Date()).toDateString()) {
								$('td > div > table > tr', row).each(function(index, cell) {
									var match = { date: today.toDateString() };
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
								var match = { date: today.toDateString() };
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

				try { fs.mkdirSync('./cache', 0777); } catch (ex) {}
				try { fs.writeFileSync(jsonPath, JSON.stringify(matches, null, '\t')); } catch (ex) {}
				
				callback(matches, today);
			  }

			});

		});
	} else {
		matches = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
		callback(matches, today);
	}
}


function addDays(theDate, days) {
	return new Date(theDate.getTime() + days*24*60*60*1000);
}

var allMatches = [];
var beginDate = new Date();
var maxDate = addDays(beginDate, 26);

function matchCallback(matches, date) {
	allMatches = allMatches.concat(matches);
	
	if (date < maxDate) {
		getMatches(addDays(date, 1), matchCallback);
	} else {
		var table = new Table({
		    head: ['Date', 'Time', 'Match', 'Channel', 'League'], 
			colWidths: [17, 9, 50, 50, 30]
		});

		var matchCount = 0;

		allMatches.forEach(function(match, index) {
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
		console.log('showing ' + matchCount + ' of ' + allMatches.length + ' matches');
	}
}

getMatches(beginDate, matchCallback);


