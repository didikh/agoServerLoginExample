/*jslint nomen: true, node: true, devel: true */
"use strict";

var request = require('request'),
    fs = require('fs'),
    jade = require('jade'),
    hljs = require('highlight.js');

var formats = {
    'json': 'text/json',
    'html': 'text/html',
    'txt': 'text/plain',
    'css': 'text/css',
    'js': 'text/javascript',
    'jade': 'text/html'
};

var utils = function () {
    var _self = this;
    /* 
        multipleRequests - handle situations where there are multiple
        requests being generated and the results are processed collectively

        Adapted from https://gist.github.com/natos/2001487 to return the 
        results in the order submitted and to allow query objects to be seperate
        from the URL
    */
    this.multipleRequests = function (urls, data, callback) {
        var requests = [],
            results = [],
            resultsDict = {},
            c = 0,
            i = 0,
            j = 0,
            handler = function (error, response, body) {
                var url = response.request.uri.href;
                resultsDict[url] = {
                    error: error,
                    response: response,
                    body: body
                };
                if (++c === urls.length) {
                    //Order the results to match input
                    while (i < requests.length) {
                        results[i] = {
                            error: requests[i].response.error,
                            response: requests[i].response,
                            body: requests[i].response.body
                        };
                        i++;
                    }
                    callback(results);
                }
            };
        while (j < urls.length) {
            requests.push(request({
                url: urls[j],
                qs: data[j]
            }, handler));
            j++;
        }
    };

    this.checkForErrors = function (responses) {
        var c = responses.length;
        while (c--) {
            if (responses[c].error) {
                return false;
            }
        }
        return true;
    };

    this.getFile = function (res, file, obj) {
        var exists, suffix, outText;
        console.log(file);
        exists = fs.existsSync('templates/' + file);
        console.log('check for template');
        console.log(fs.readdirSync('templates/'));
        if (exists) {
            suffix = file.substr(file.lastIndexOf(".") + 1);
            if (suffix === 'jade') {
                var vars = {
                    username: "",
                    name: ""
                };
                if (obj !== undefined && obj !== null) {
                    //update keys
                    for(var key in obj) {
                        vars[key] = obj[key];
                    }
                }
                outText = jade.renderFile('templates/' + file, {
                    pretty: true,
                    globals: vars
                });
            } else {
                outText = fs.readFileSync('templates/' + file, {
                    'encoding': 'utf8'
                });
            }

            res.setHeader('Content-Type', formats[suffix]);
            res.writeHead(200);
            res.write(outText);
            res.end();            
        } else {
            _self.notFound(res);
        }
        
    };

    this.sendMessage = function (res, msg, f) {
        res.setHeader('Content-Type', formats[f]);
        res.writeHead(200);
        var msgText = msg;
        if (f == 'json') {
            msgText = JSON.stringify(msg);
        }
        res.write(msgText);
        res.end();
    };
    
    this.getSource = function(res, file, css, dir){
        var fullFile = file;
        var fileList = [];
        css = css || 'default';
        //Build the file list
        console.log(dir);
        var thisDir = fs.readdirSync(dir);
        for(var f=0; f < thisDir.length; f++) {
            var thisFile = thisDir[f];
            if (thisFile.substr(-3) === ".js") {
                fileList.push(thisFile);
            }
        }
        fileList.push('requestUtils.js');
        fileList.push('AGOconnection.js');
        
        if (fs.existsSync(__dirname + "\\" + file)) {
            fullFile = __dirname + "\\" + file;
        }
        var code = hljs.highlightAuto(fs.readFileSync(fullFile, {encoding:'ascii'}));
        var vars = {
            cssFile : "//yandex.st/highlightjs/8.0/styles/" + css + ".min.css",
            code : code.value,
            fileList: fileList,
            selected: file
        };
        var outText = jade.renderFile(__dirname + "\\source.jade", {
            pretty:true,
            globals: vars
        });
        
        res.setHeader('Content-Type', formats.html);
        res.writeHead(200);
        res.write(outText);
        res.end();
    };

    this.reportError = function (res, comment) {
        res.writeHead(400);
        res.write(comment);
        res.end();
    };
    
    this.notFound = function(res){
        res.writeHead(404);
        res.write('File not found');
        res.end();
    };
};

exports.utils = function () {
    return new utils();
};