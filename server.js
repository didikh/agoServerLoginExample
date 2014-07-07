/*jslint node: true, devel: true, vars:true, plusplus:true */
"use strict";

var http = require('http'),
    https = require('https'),
    url = require('url'),
    qs = require('querystring'),
    JSON = require('JSON'),
    fs = require('fs'),
    reqUtils = require('./libs/requestUtils.js').utils(),
    config = require('./config.js').config;

http.createServer(function (req, res) {
    //CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
    var thisReq, data, item, i,
        uri = url.parse(req.url).pathname,
        query = url.parse(req.url, true).query,
        standardResponse, checkJob;
     
    uri = uri.substr(uri.lastIndexOf('/'));
    console.log(uri);
    
    switch (uri) {
    case '/':
    case '/server.js':
    case '/index.html':
        console.log('index');
        reqUtils.getFile(res, 'index.jade');
        break;
    case '/viewApp':
        reqUtils.getFile(res, 'viewApp.jade', 
            {
                title: 'oAuth Server Logins',
                app:config.app[query.app].path, 
                showConsole:config.showConsole, 
                index:config.app[query.app].index
            });
        break;
    case '/favicon.ico':
        res.end();
        break;
    default:
        reqUtils.getFile(res, uri.substr(1));
        break;
    }
}).listen(process.env.PORT);