/* jshint esnext:true, globalstrict:true */
/* global require, module, console, __dirname, process */

'use strict';

const express = require('express');
const Q 			= require('q');

const library = require('../models/library.js').Library;

module.exports.router = configure_router;

function configure_router() {

	const router = express.Router();

	function handle_err(err) {
		console.log(err,err.stack);
		throw err;
	}

	router.get('/about', (req, res) => res.render('about') );

	router.get('/authors', (req,res) => {
		var page = req.query.page || 0;
		library.authors_list(page)
			.then( authors => {
				let title = 'List of authors';
				res.render('authors', { title: title, authors:authors });
			})
			.catch(handle_err);
	});

	router.get('/authors/:letter', (req,res) => {
		var page = req.query.page || 0;
		console.log(req.params.letter);
		library.authors_list_by_letter(req.params.letter, page, 1000)
			.then( authors => {
				let title = 'List of authors starting with '+req.params.letter;
				res.render('authors', { title: title, authors:authors });
			})
			.catch(handle_err);
	});

	router.get('/subjects', (req,res) => {
		var page = req.query.page || 0;
		library.subjects_list(page)
			.then( subjects => {
				let title = 'List of subjects';
				res.render('subjects', { title: title, subjects:subjects });
			})
			.catch(handle_err);
	});

	router.get('/subjects/:letter', (req,res) => {
		var page = req.query.page || 0;
		console.log(req.params.letter);
		library.subjects_list_by_letter(req.params.letter, page, 1000)
			.then( subjects => {
				let title = 'List of subjects starting with '+req.params.letter;
				res.render('subjects', { title: title, subjects:subjects });
			})
			.catch(handle_err);
	});

	router.get('/item/:item_id', (req,res) => {
		library.item_detail(req.params.item_id)
			.then( data => {
				res.render('item',data);
			})
			.catch(handle_err);
	});

	router.get('/by/author/:author_id', (req,res) => {
		var page = req.query.page || 0;
		var author = req.params.author_id;
		Q.all([ library.author(author), library.items_by_author(author, page)])
			.spread( (author, results) => {
				let title = "All books by author: "+author.name +' '+ author.type;
				res.render('index',{ title:title, items:results.rows});
			})
			.catch(handle_err);
	});

	router.get('/by/subject/:subject_id', (req,res) => {
		var page = req.query.page || 0;
		var subject = req.params.subject_id;
		Q.all([ library.subject(subject), library.items_by_subject(subject, page)])
			.spread( (subject, results) => {
				let title = "All books by subject: "+subject.subject;
				res.render('index',{ title:title, items:results.rows });
			})
			.catch(handle_err);
	});

	router.get('/',(req,res) => {
		var page = req.query.page || 0;
		library.items(page)
			.then(results=> res.render('index', {items:results.rows}))
			.catch(handle_err);
		
	});

	return router;

}

function import_from_(){}