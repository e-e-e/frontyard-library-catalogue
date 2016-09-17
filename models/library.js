/* jshint esnext:true, globalstrict:true */
/* global require, module, console, __dirname */

'use strict';

const db 			= require('./database.js');
const config 	= require('../config.json');

const url 		= require('url');

const Q 			= require('q');
const request = require('request');
const cheerio = require('cheerio');

function promise_each(array, fn) {
	return Q.all(array.map(fn));
}

function ids_overlap(id_a,id_b) {
	console.log(id_a+'\n'+id_b);
	console.log('---');
	let ids = id_b.split(' ');
	let filtered_ids = ids.filter(e=>(id_a.indexOf(e)>=0));
	return (filtered_ids.length>0);//(ids.length === filtered_ids.length);
}

function get_trove_biblio_data(trove_link) {
	var deferred = Q.defer();
	request(trove_link,(error, response, body) => {
		if(error) {
			console.log(error);
			deferred.reject(error);
		} else {
			if(response.statusCode === 200) {
				var bibrec = {};
				var $ = cheerio.load(body);
				var details = $('div#details-version dl.details');
				var titles = details.children('dt').map( (i,e) => $(e).text() ).toArray();
				var content = details.children('dd');
				content.each((i,e)=>{
					let values = $(e).find('li, a').map((i,e)=> $(e).text().trim()).toArray();
					bibrec[titles[i]] = (values.length===1)? values[0]: values;
				});
				deferred.resolve(bibrec);
			} else {
				deferred.reject(response);
			}
		}
	});
	return deferred.promise;
} 

function get_trove_json_data(work_id,version_id) {
	//convert link to trove api link
	var deferred = Q.defer();
	request({
		method: "GET",
		url: "http://api.trove.nla.gov.au/work/"+work_id,
		qs: {
			q:'',
			versionId:version_id,
			encoding:'json',
			include:'workVersions,holdings',
			reclevel:'full',
			key:config.trove.key
			}
		}, (error, response, body) => {
			if(error) {
				console.log(error);
				deferred.reject(error);
			} else {
				if(response.statusCode === 200) {
					deferred.resolve(JSON.parse(body));
				} else {
					deferred.reject(response);
				}
			}
		}
	);
	return deferred.promise;
}

function get_version_info(work,version_id) {
	let trove_work_id,
			trove_version_id,
			trove_link,
			title,
			publisher,
			issued,
			holding_count,
			version_count,
			primary_author,
			authors;
	let versions = work.version;

	trove_work_id = work.id;
	holding_count = work.holdingsCount;

	for(let i =0; i<versions.length; i++) {
		let version = versions[i];
		//console.log(version.id);
		if(ids_overlap(version.id, version_id)) {
			//console.log(version);
			let record = (Array.isArray(version.record)) ? version.record[0] : version.record;
			version_count = version.holdingsCount;
			trove_version_id = version.id;
			trove_link = work.troveUrl + '?q&versionId=' + trove_version_id;
			issued = record.issued;
			console.log(record);
			title = (typeof record.title ==='string')? record.title : record.title[0];
			if (record.publisher) {
				publisher = (typeof record.publisher ==='string')? record.publisher : record.publisher[0];
			} else {
				publisher = null;
			}
			if (Array.isArray(record.creator)) {
				authors = record.creator;
			} else { // is object or string
				authors= [record.creator || '' ];
			}
			break;
		}
	}
	if(!trove_link) {
		throw new Error('NO VALID VERSION LINK FOUND');
	}
	primary_author = (typeof authors[0]==='string')? authors[0] : authors[0].value +' ' + authors[0].type;
	return {	title:title,
						authors:authors, 
						primary_author:primary_author, 
						publisher:publisher, 
						issued:issued, 
						holding_count:holding_count, 
						version_count:version_count, 
						trove_link:trove_link, 
						trove_work_id:trove_work_id, 
						trove_version_id:trove_version_id };
}

class Library {
	
	constuctor() {

	}

	add(base_trove_link, notes) {
		var link = url.parse(base_trove_link, true);
		var url_work_id = link.pathname.split('/').pop();
		var url_version_id = link.query.versionId;
		var data;
		return get_trove_json_data(url_work_id,url_version_id)
			.then( json => {
				data = get_version_info(json.work,url_version_id);
				data.json = json;
				return get_trove_biblio_data(data.trove_link);
			})
			.then( bibrec => {
				data.bibrec = bibrec;
				//this could be made prettier.
				return db.query('INSERT INTO items (title, author, publisher, issued, work_holdings, version_holdings, trove_link, trove_work_id, trove_version_id, trove_bibrec, trove_json, fy_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (trove_link) DO NOTHING RETURNING item_id;',[ data.title, data.primary_author, data.publisher, data.issued, data.holding_count, data.version_count, data.trove_link, data.trove_work_id, data.trove_version_id, data.bibrec, data.json, notes ]);
			})
			.then( result => {
				if(result.rowCount===0) {
					throw new Error('Duplicate!');
				}
				data.item_id = result.rows[0].item_id;
				return promise_each(data.authors, e => { 
						let name, type='';
						if(typeof e === 'string') {
							name = e;
						} else {
							name = e.value;
							type = e.type;
						}
						return db.query('INSERT INTO authors (name,type) VALUES ($1,$2) ON CONFLICT ON CONSTRAINT authors_name_type_key DO UPDATE SET name = EXCLUDED.name RETURNING author_id;', [name,type]);
					});
			})
			.then( results => {
				return promise_each( results, (e,index) => 
						db.query('INSERT INTO items_authors (item_id,author_id,author_ordinal) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING;', 
											[data.item_id,e.rows[0].author_id, index ])
					);
			})
			.then( () => {
				if(data.bibrec.Subjects)
					return promise_each( data.bibrec.Subjects, subject => 
							db.query('INSERT INTO subjects (subject) VALUES ($1) ON CONFLICT ON CONSTRAINT subjects_subject_key DO UPDATE SET subject = EXCLUDED.subject RETURNING subject_id;', [ subject ])
						);
				else return [];
			})
			.then( results => {
				return promise_each(results, r => 
						db.query('INSERT INTO items_subjects (item_id,subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING;', 
							[data.item_id,r.rows[0].subject_id ])
					);
			}).catch( err => {
				if(err.message === 'Duplicate!') {
					console.log('is duplicate!');
				} else {
					throw err;
				}
			});
	}

	items(page, x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT item_id, title, author, publisher, issued, fy_notes, work_holdings, version_holdings, trove_link FROM items ORDER BY work_holdings LIMIT $1 OFFSET $2',[number,offset]);
	}

	items_by_author(id,page,x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT item_id, title, author, publisher, issued, fy_notes, work_holdings, version_holdings, trove_link FROM items INNER JOIN items_authors AS b USING (item_id) WHERE b.author_id=$1 ORDER BY work_holdings LIMIT $2 OFFSET $3',[id,number,offset]);
	}

	items_by_subject(id,page,x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT item_id, title, author, publisher, issued, fy_notes, work_holdings, version_holdings, trove_link FROM items INNER JOIN items_subjects AS b USING (item_id) WHERE b.subject_id=$1 ORDER BY work_holdings LIMIT $2 OFFSET $3',[id,number,offset]);
	}

	item_detail(id) {
		return db.query('SELECT item_id, title, author, publisher, issued, fy_notes, work_holdings, version_holdings, trove_link, trove_bibrec FROM items WHERE item_id = $1',[id])
			.then( results => {
				return Q.all(
					[ results.rows[0],
						this.subjects(results.rows[0].item_id),
						this.authors(results.rows[0].item_id) ]);
			})
			.spread((data, subjects, authors)=> {
				data.subjects = subjects.rows;
				data.authors = authors.rows;
				console.log(data.subjects);
				return data;
			});
	}

	author (id) {
		return db.query('SELECT * FROM authors WHERE author_id = $1;',[id]).then(r => r.rows[0]);
	}

	authors (item_id) {
		return db.query('SELECT a.author_id, a.name, a.type FROM authors AS a INNER JOIN items_authors AS b ON a.author_id = b.author_id WHERE b.item_id = $1 ORDER BY b.author_ordinal;',[item_id]);
	}

	authors_list(page, x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT a.author_id, a.name, a.type FROM authors AS a ORDER BY lower(a.name) LIMIT $1 OFFSET $2',[number,offset])
			.then(r => r.rows);
	}

	authors_list_by_letter(letter, page, x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT a.author_id, a.name, a.type FROM authors AS a WHERE a.name ILIKE $3 ORDER BY lower(a.name) LIMIT $1 OFFSET $2',[number,offset,letter+'%'])
			.then(r => r.rows);
	}

	subject (id) {
		return db.query('SELECT * FROM subjects WHERE subject_id = $1;',[id]).then(r => r.rows[0]);
	}

	subjects(item_id) {
		if(item_id) 
			return db.query('SELECT a.subject_id, a.subject FROM subjects AS a INNER JOIN items_subjects AS b ON a.subject_id = b.subject_id WHERE b.item_id = $1;',[item_id]);
		else
			return db.query('SELECT a.subject_id, a.subject, count(b.subject_id) AS amount FROM subjects AS a INNER JOIN items_subjects AS b ON a.subject_id = b.subject_id GROUP BY a.subject_id HAVING count(b.subject_id) >= 10 ORDER BY amount DESC');
	}

	subjects_list(page, x) {
		var number = x || 100;
		var offset = page*number;
			return db.query('SELECT a.subject_id, a.subject FROM subjects AS a ORDER BY lower(a.subject) LIMIT $1 OFFSET $2',[number,offset])
			.then(r => r.rows);
	}

	subjects_list_by_letter(letter, page, x) {
		var number = x || 100;
		var offset = page*number;
		return db.query('SELECT a.subject_id, a.subject FROM subjects AS a WHERE a.subject ILIKE $3 ORDER BY lower(a.subject) LIMIT $1 OFFSET $2',[number,offset,letter+'%'])
			.then(r => r.rows);
	}

}

/*global exports:true*/
exports = module.exports = {
	Library: new Library()
};