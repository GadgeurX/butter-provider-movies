'use strict';

var _ = require('lodash');
var Generic = require('butter-provider');
var inherits = require('util').inherits;
var Q = require('q');
var querystring = require('querystring');
var request = require('request');
var sanitize = require('butter-sanitize');

var MovieApi = function(args) {
	if (!(this instanceof MovieApi)) return new MovieApi(args);

	Generic.call(this, args);

	this.apiURL = this.args.apiURL || ['https://movies-v2.api-fetch.website/'];
  this.lang = this.args.lang || 'en';
};

inherits(MovieApi, Generic);

MovieApi.prototype.config = {
	name: 'MovieApi',
	uniqueId: 'imdb_id',
	tabName: 'MovieApi',
  args: {
    apiURL: Generic.ArgType.ARRAY,
    lang: Generic.ArgType.STRING
	},
	metadata: 'trakttv:movie-metadata'
};

function formatFetch(movies) {
	var results = _.map(movies, function (movie) {
		if (movie.torrents) {
			return {
				imdb_id: movie.imdb_id,
				title: movie.title,
				year: movie.year,
				genres: movie.genres,
				rating: parseInt(movie.rating.percentage, 10) / 10,
        poster: movie.images.poster,
        type: Generic.ItemType.MOVIE,
        runtime: movie.runtime,
        backdrop: movie.images.fanart,
        subtitle: {},
				synopsis: movie.synopsis,
				trailer: movie.trailer,
				torrents: movie.torrents['fr'] !== undefined ? movie.torrents['fr'] : ((movie.torrents["ca"] !== undefined) ? movie.torrents["ca"] : movie.torrents["en"]),
        langs: movie.torrents
			};
		}
	});

	return {
		results: sanitize(results),
		hasMore: true
	};
}

function formatDetail(movie) {
  return {
    imdb_id: movie.imdb_id,
    title: movie.title,
    year: movie.year,
    genres: movie.genres,
    rating: parseInt(movie.rating.percentage, 10) / 10,
    poster: movie.images.poster,
    type: Generic.ItemType.MOVIE,
    runtime: movie.runtime,
    backdrop: movie.images.fanart,
    synopsis: movie.synopsis,
    subtitle: {},
    trailer: movie.trailer,
    torrents: movie.torrents['en'] !== null ? movie.torrents['en'] : movie.torrents[Object.keys(movie.torrents)[0]],
    langs: movie.torrents
  };
}

function processCloudFlareHack(options, url) {
	var req = options;
	var match = url.match(/^cloudflare\+(.*):\/\/(.*)/);
	if (match) {
		req = _.extend(req, {
			uri: match[1] + '://cloudflare.com/',
			headers: {
				'Host': match[2],
				'User-Agent': 'Mozilla/5.0 (Linux) AppleWebkit/534.30 (KHTML, like Gecko) PT/3.8.0'
			}
		});
	}
	return req;
}

function get(index, url, that) {
	var deferred = Q.defer();

	var options = {
		url: url,
		json: true
	};

	var req = processCloudFlareHack(options, that.apiURL[index]);
	console.info('Request to MovieApi', req.url);
	request(req, function(err, res, data) {
		if (err || res.statusCode >= 400) {
			console.warn('MovieAPI endpoint \'%s\' failed.', that.apiURL[index]);
			if (index + 1 >= that.apiURL.length) {
				return deferred.reject(err || 'Status Code is above 400');
			} else {
				return get(index + 1, url, that);
			}
		} else if (!data || data.error) {
			err = data ? data.status_message : 'No data returned';
			console.error('API error:', err);
			return deferred.reject(err);
		} else {
			return deferred.resolve(data);
		}
	});

	return deferred.promise;
}

MovieApi.prototype.extractIds = function (items) {
	return _.map(items.results, 'imdb_id');
};

MovieApi.prototype.fetch = function (filters) {
	var that = this;

	var params = {};
	params.sort = 'seeds';
	params.limit = '50';

	if (filters.keywords) {
		params.keywords = filters.keywords.replace(/\s/g, '% ');
	}

	if (filters.genre) {
		params.genre = filters.genre;
	}

	if (filters.order) {
		params.order = filters.order;
	}

	if (filters.sorter && filters.sorter !== 'popularity') {
		params.sort = filters.sorter;
	}

  filters.page = filters.page ? filters.page : 1;

	var index = 0;
	var url = that.apiURL[index] + 'movies/' + filters.page + '?' + querystring.stringify(params).replace(/%25%20/g, '%20');
	return get(index, url, that).then(formatFetch);
};

MovieApi.prototype.detail = function (torrent_id, old_data, debug) {
  if (old_data) {
    return Q(old_data);
  }

  var that = this;
	var index = 0;
	var url = that.apiURL[index] + 'movie/' + torrent_id;
	return get(index, url, that).then(formatDetail);
};

MovieApi.prototype.random = function () {
	var that = this;
	var index = 0;
	var url = that.apiURL[index] + 'random/movie';
  return get(index, url, that).then(formatDetail);
};

MovieApi.prototype.resolveStream = function (src, filters, data) {
  filters.lang = filters.lang ? filters.lang : this.lang;
	var qualities = Object.keys(data.torrents);
  filters.quality = filters.quality !== 'none' ? filters.quality : qualities[0];

	return data.langs[filters.lang][filters.quality];
};

module.exports = MovieApi;
