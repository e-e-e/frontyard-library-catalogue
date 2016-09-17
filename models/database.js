/* jshint esnext:true, globalstrict:true */
/* global require, module, console, __dirname */

'use strict';

const pg = require('pg');
const Q = require('q');
const postgres_options = require('../config.json').postgres;

var connectionParameters = 'postgres://admin:admin@localhost:5432/library';

class Query {
	constructor(name, text, values) {
		this.name = name;
		this.text = text;
		this.values = values;
	}
}

const query = function(text, values) {
	var q = new Query();

	if(typeof text === 'string'){
		q.text = text;
		q.values = values || [];
	}

	var deferred = Q.defer();
	pg.connect(connectionParameters, (err,client,done) => {
		if(err)	{
			done(err);
			deferred.reject(err);
		} else {
			client.query(q,(err,res)=> {
				if(err) deferred.reject(err);
				else deferred.resolve(res);
				done();
			});
		}
	});
	return deferred.promise;
};

/*global exports:true*/
exports = module.exports = {
	query: query,
};
