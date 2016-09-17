/* jshint esnext:true, globalstrict:true */
/* global require, module, console, __dirname, process */

"use strict";

const fs = require('fs');

const Q				= require('q');
const parse 	= require('csv-parse');
const transform = require('stream-transform');

const library = require('../models/library.js').Library;

function import_from_csv(file) {
	
	var parser = parse({delimiter: ','});
	var input = fs.createReadStream('./library.csv');
	var count = 0;
	var ignore = [12];
	var transformer = transform((record, callback) => {
		count++;
		var link = record[5];
		var notes = record[7];
		console.log(count+': '+ link);
		if(notes) console.log(count+': #'+ notes);
		if(link.indexOf('http')===0 ) {
			library.add(link,notes)
				.then(()=>console.log('successfully added'))
				.delay(600)
				.catch(e=> {
					console.log('error at record'+count);
					console.log(e);
					callback(e);
				})
				.done(()=>callback(null,''));
		} else {
			callback(null,'');
		}
	}, {parallel: 1});
	input.pipe(parser).pipe(transformer).pipe(process.stdout);
}