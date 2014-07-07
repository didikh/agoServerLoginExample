/*jslint node: true, devel: true, vars:true, plusplus:true */
"use strict";

var appInfo = {};
appInfo = require('../appSettings.js');
// Comment the line above and uncomment the lines below to run interactively
//if (process.argv[2] !== undefined || process.argv[3] !== undefined) {
//    appInfo = {
//        appId : process.argv[2],
//        appSecret : process.argv[3]
//    };
//}
//
//if (!appInfo.hasOwnProperty('appId') || !appInfo.hasOwnProperty('appSecret')) {
//    console.log('Missing paramter!');
//    console.log('Usage:');
//    console.log('node serverUserLogin.js <APPID> <APPSECRET>');
//    process.exit(1);
//}


var http = require('http'),
    https = require('https'),
    request = require('request'),
    url = require('url'),
    qs = require('querystring'),
    JSON = require('JSON'),
    fs = require('fs'),
    AGO = require('../libs/AGOconnection.js'),
    reqUtils = require('../libs/requestUtils.js').utils();

var APP = AGO.appLogin(appInfo.appId, appInfo.appSecret);

var consoleResponse;


http.createServer(function (req, res) {
    //CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
    var thisReq, data, item, i,
        uri = url.parse(req.url).pathname,
        query = url.parse(req.url, true).query,
        standardResponse, checkJob;
     
    uri = "/" + uri.substr(uri.indexOf('appLogin') + 9);
    console.log(uri);

    standardResponse = function (err, response, body) {
        if (!err) {
            reqUtils.sendMessage(res, body, 'json');
        } else {
            reqUtils.reportError(res, '{error: could not complete function}');
        }
    };

    //checkJob - polls the staus of asynchronus tasks, grabs the result when ready
    checkJob = function (taskURL, jobId) {
        var thisReqURL, data, thisReq;
        thisReqURL = taskURL + "/jobs/" + jobId + "/";
        data = APP.createDataObject({
            'returnMessages': true
        });
        thisReq = request({
            url: thisReqURL,
            qs: data
        }, function (error, response, body) {
            var bodyObj;
            if (body) {
                bodyObj = JSON.parse(body);
                if (bodyObj.hasOwnProperty('jobStatus')) {
                    if (['esriJobSubmitted', 'esriJobWaiting', 'esriJobExecuting'].indexOf(bodyObj.jobStatus) >= 0) {
                        setTimeout(checkJob, 1000, taskURL, jobId, response);
                    } else if (bodyObj.jobStatus === 'esriJobSucceeded') {
                        request({
                            'url': thisReqURL + '/results/Service_Areas',
                            qs: data
                        }, standardResponse);
                        //standardResponse(error, response, body);
                    } else {
                        reqUtils.reportError(res, 'Unspecifed error processing');
                    }
                } else {
                    reqUtils.reportError(res, 'Unspecifed error processing');
                }
            }
        });
    };

    switch (uri) {
    case '/':
    case '/index.html':
        reqUtils.getFile(res, 'index.jade');
        break;
    /*
        token - Return the token the app is using
    BAD EXAMPLE - NEVER PUT IN YOUR OWN APP
        You would normally *NEVER* have this operation in a web
        application - providing the token to clients gives the client
        the permissions of the application directly until token expiry
    */
    case '/token':
        reqUtils.sendMessage(res, APP.token, 'text');
        break;

    /*
        search - Search AGO for items.  
        Note that this returns only publicly shared items
    */
    case '/search':
        var q;
        q = APP.createDataObject({
            'q': query.q
        });
        request({
            url: AGO.arcgisURLs.search,
            qs: q
        }, standardResponse);
        break;
    /*
        getItem - Get item information
        works for items shared publicly or owned by application owner
    */
    case '/getItem':
        item = query.item || '8543d1c1386f47c3b2bdac110f6015e7';
        data = APP.createDataObject();
        thisReq = request({
            'url': AGO.arcgisURLs.portalURL + 'content/items/' + item,
            'qs': data
        }, standardResponse);
        break;

        /*
        getData - run a query against a hosted feature service
        works for items shared publicly or owned by application owner
    */
    case '/getData':
        item = query.item || '8543d1c1386f47c3b2bdac110f6015e7';
        data = APP.createDataObject({
            'where': '1=1',
            'outFields': '*',
            'returnGeometry': 'false'
        });
        thisReq = request({
            'url': AGO.arcgisURLs.portalURL + 'content/items/' + item,
            'qs': data
        }, function (err, resp, body) {
            var itemObj;
            itemObj = JSON.parse(body);
            request({
                'url': itemObj.url + '/0/query',
                'qs': data
            }, standardResponse);

        });
        break;

    /*
        geocode - Single address geocode
        This is a free operation in ArcGIS Online
    */
    case '/geocode':
        var address;
        address = query.address || '8615 Westwood Center Drive, Vienna, VA 22182';
        data = APP.createDataObject({
            'text': address
        });
        thisReq = request({
            'url': AGO.arcgisURLs.geosearch,
            qs: data
        }, standardResponse);
        break;
        /*
        batchGeocode - Multiple address geocode
        This is not a free operation
        Addresses are seperated by semicolon
    */
    case '/batchGeocode':
        var inAddresses, addressList, addressObj;
        inAddresses = query.addresses || '380 New York St, Redlands, CA 92373;8615 Westwood Center Drive, Vienna, VA 22182';
        //Process into recordsets
        addressList = inAddresses.split(';');
        addressObj = {
            "records": []
        };
        for (i = 0; i < addressList.length; i = i + 1) {
            addressObj.records.push({
                "attributes": {
                    "OBJECTID": i + 1,
                    "SingleLine": addressList[i]
                }
            });
        }
        (JSON.stringify(addressObj));
        data = APP.createDataObject({
            'addresses': JSON.stringify(addressObj)
        });
        thisReq = request({
            'url': AGO.arcgisURLs.geocode,
            qs: data
        }, standardResponse);
        break;
        /*
        route2 - generate a route between 2 addresses
        this takes two addresses (from & to) as parameters,
        geocodes them, and then routes between them
    */
    case '/route2':
        var fromAdddress, toAddress, toData, fromData, g, requestURLs, requestData, geoSearchResults = [];
        fromAdddress = query.from || '8615 Westwood Center Drive, Vienna VA 22182';
        toAddress = query.to || '801 Mt. Vernon Place NW, Washington DC 20001';
        fromData = APP.createDataObject({
            'text': fromAdddress
        });
        toData = APP.createDataObject({
            'text': toAddress
        });
        requestURLs = [AGO.arcgisURLs.geosearch, AGO.arcgisURLs.geosearch];
        requestData = [fromData, toData];
        reqUtils.multipleRequests(requestURLs, requestData, function (responses) {
            //var toRes, fromRes, toStop, fromStop, 
            var removeThese = ['Score', 'Addr_Type'],
                stops = [],
                r, thisStop, thisRes, a, data, e, errRes;
            if (reqUtils.checkForErrors(responses)) {
                for (r = 0; r < responses.length; r++) {
                    thisRes = JSON.parse(responses[r].body);
                    thisStop = thisRes.locations[0].feature;
                    thisStop.attributes.name = thisRes.locations[0].name;
                    for (a = 0; a < removeThese.length; a++) {
                        if (thisStop.attributes.hasOwnProperty(removeThese[a])) {
                            delete thisStop.attributes[removeThese[a]];
                        }
                    }
                    stops.push(thisStop);
                }
                data = APP.createDataObject({
                    stops: JSON.stringify({
                        features: stops
                    })
                });
                thisReq = request({
                    'url': AGO.arcgisURLs.route,
                    qs: data
                }, standardResponse);
            } else {
                for (e = 0; e < responses.length; e++) {
                    if (responses[e].error) {
                        errRes = responses[e];
                    }
                }
                reqUtils.reportError(errRes, 'Invalid geocode result');
            }

        });

        break;
        /*
        drivetime - generate a drivetime polygon
        Note that this is an asynchronus operation, so we
        need to use the checkJob routine to poll AGO for 
        completion.  After completion, we can retrieve the 
        drivetime polygon.
    */
    case '/drivetime':
        var name, FC, distVals, reqData, reqOptions, x, y;
        //Test point
        x = query.x || -77.25;
        y = query.y || 38.92;

        //Form the FeatureCollection from the inputs
        name = query.name || 'Point';
        FC = {
            "spatialReference": {
                "wkid": 4326,
                "latestWkid": 4326
            },
            "features": [
                {
                    geometry: {
                        "x": parseFloat(x),
                        "y": parseFloat(y)
                    },
                    attributes: {
                        "name": name
                    }
                }
            ]
        };
        //Other parameters
        //Distance - comes in as a comma-seperated string; split into units and run parseFloat on them
        distVals = query.distance || '5';
        distVals = distVals.split(',').map(function (val) {
            return parseFloat(val);
        });
        data = APP.createDataObject({
            "facilities": JSON.stringify(FC),
            "break_values": distVals.join(' '),
            "break_units": "Minutes"

        });
        thisReq = request({
            url: AGO.arcgisURLs.serviceArea + '/submitJob',
            qs: data
        }, function (err, response, body) {
            var thisJobInfo = JSON.parse(body);
            if (thisJobInfo.jobId) {
                checkJob(AGO.arcgisURLs.serviceArea, thisJobInfo.jobId);
            } else {
                reqUtils.sendMessage(res, body, 'json');
            }
        });

        break;
    case '/buffer':
        
        break;

    case '/source.html':

        reqUtils.getSource(res, query.file, query.css, __dirname);
        break;
    case '/favicon.ico':
        res.end();
        break;
    default:
        reqUtils.getFile(res, uri.substr(1));
        break;
    }
}).listen(process.env.PORT);


//--- HELPER FUNCTIONS ---//


// consoleResponse - logs results to the console
consoleResponse = function (err, body) {
    console.log('Error:');
    console.log(err);
    console.log('Body');
    if (body) {
        var c = (body.length > 500) ? 500 : body.length;
        console.log(body.substr(0, c));
    }
    console.log('----------------');
};

//// reportError - return an error
//reportError = function (res, comment) {
//    res.writeHead(400);
//    res.write(comment);
//    res.end();
//};