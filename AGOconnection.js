/*jslint nomen: true, node: true, devel: true */
"use strict";

var https = require('https'),
	url = require('url'),
	qs = require('querystring'),
	JSON = require('JSON');

function AGO(_appid, _appsecret) {
	var _self = this;
	this.APPID = _appid;
	this.APPSECRET = _appsecret;
    
    this.URLS = {
        'geosearch' : 'http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/find',
        'geocode' : 'http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/geocodeAddresses',
        'route' : 'http://route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World/solve',
        'search' : 'http://www.arcgis.com/sharing/rest/search',
        'serviceArea' : 'http://logistics.arcgis.com/arcgis/rest/services/World/ServiceAreas/GPServer/GenerateServiceAreas',
        'users': 'http://www.arcgis.com/sharing/rest/content/users/'
    };
    
	this.token = null;
    this.portalURL = 'http://www.arcgis.com/sharing/rest/';
    this.analysisURL = 'http://analysis.arcgis.com/arcgis/rest/services/tasks/GPServer/';
	this._refresh = null;
	this._getToken = function () {
		// request parameters
		var post_data = qs.stringify({
			'client_id' : _self.APPID,
			'client_secret' : _self.APPSECRET,
			'grant_type' : 'client_credentials'
        }),
            // request setup
            post_options = {
                host: 'www.arcgis.com',
                port: '443',
                path: '/sharing/oauth2/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': post_data.length
                }
            },
            //Make the request
            post_req = https.request(post_options, function (postres) {
                postres.setEncoding('utf8');
                postres.on('data', function (chunk) {
                    var tokenObj = JSON.parse(chunk);
                    _self.token = tokenObj.access_token;
                    console.log(new Date());
                    console.log(tokenObj.access_token);
                    console.log('-------------------');
                    //We'll set the refresh 30 seconds before AGO expiration
                    _self._refresh = setTimeout(_self._getToken, (tokenObj.expires_in - 30) * 1000);
                });
            });
        // post the data
		post_req.write(post_data);
		post_req.end();
	};

    //init code here
    this._getToken();
}

exports.AGO = function (appid, appsecret) {
	return new AGO(appid, appsecret);
};

