/*jslint nomen: true, node: true, devel: true */
"use strict";

var https = require('https'),
    url = require('url'),
    qs = require('querystring'),
    JSON = require('JSON');

function appLogin(_appid, _appsecret) {
    var _self = this;
    this.APPID = _appid;
    this.APPSECRET = _appsecret;
    this.token = null;
    this._refresh = null;
    this._getToken = function () {
        // request parameters
        var post_data = qs.stringify({
                'client_id': _self.APPID,
                'client_secret': _self.APPSECRET,
                'grant_type': 'client_credentials'
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

function userLogin(_appid, _appsecret) {
    var _self = this;


    this.APPID = _appid;
    this.APPSECRET = _appsecret;
    //    this.logins = {}
    //	this.token = null;
    //    this._refreshToken = null;
    //	this._refresh = function(refreshToken){};
    this.getToken = function (inUrl, redirectURI, callback, res) {
        var thisUrl = url.parse(inUrl, true);
        //check for the code query parameter
        if (thisUrl.query.hasOwnProperty('code')) {
            //Make a request to https://www.arcgis.com/sharing/oauth2/token
            var post_data, post_options, post_req;
            post_data = qs.stringify({
                client_id: _self.APPID,
                client_secret: _self.APPSECRET,
                grant_type: 'authorization_code',
                code: thisUrl.query.code,
                redirect_uri: redirectURI
            });
            // request setup
            post_options = {
                host: 'www.arcgis.com',
                port: '443',
                path: '/sharing/oauth2/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': post_data.length
                },
            };
            //Make the request
            post_req = https.request(post_options, function (postres) {
                postres.setEncoding('utf8');
                postres.on('data', function (chunk) {
                    //Get the token and refresh token
                    //exchange the refresh token for a long life token
                    //go to /sharing/rest/accounts/self to get username
                    //commit those as keys
                    var tokenObj = JSON.parse(chunk);
                    console.log(tokenObj);
                    callback(tokenObj, res);
                });
            });
            // post the data
            post_req.write(post_data);
            post_req.end();
        } else {
            callback(null, res);
        }
    };
    this.refreshToken = function (refreshToken, callback, res) {
        var post_data, post_options, post_req;
        post_data = qs.stringify({
            client_id: _self.APPID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        // request setup
        post_options = {
            host: 'www.arcgis.com',
            port: '443',
            path: '/sharing/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': post_data.length
            },
        };
        //Make the request
        post_req = https.request(post_options, function (postres) {
            postres.setEncoding('utf8');
            postres.on('data', function (chunk) {
                //Get the token and refresh token
                //exchange the refresh token for a long life token
                //go to /sharing/rest/accounts/self to get username
                //commit those as keys
                var tokenObj = JSON.parse(chunk);
                console.log(tokenObj);
                callback(tokenObj, res);
            });
        });
        // post the data
        post_req.write(post_data);
        post_req.end();

    };

}


exports.arcgisURLs = {
    'portalURL': 'http://www.arcgis.com/sharing/rest/',
    'analysisURL': 'http://analysis.arcgis.com/arcgis/rest/services/tasks/GPServer/',
    'geosearch': 'http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/find',
    'geocode': 'http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/geocodeAddresses',
    'route': 'http://route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World/solve',
    'search': 'http://www.arcgis.com/sharing/rest/search',
    'serviceArea': 'http://logistics.arcgis.com/arcgis/rest/services/World/ServiceAreas/GPServer/GenerateServiceAreas',
    'users': 'http://www.arcgis.com/sharing/rest/content/users/'
};

exports.appLogin = function (appid, appsecret) {
    return new appLogin(appid, appsecret);
};

exports.userLogin = function (appid, appsecret) {
    return new userLogin(appid, appsecret);
};