/*jslint node: true, devel: true, vars:true, plusplus:true */
"use strict";

if (process.argv[2] === undefined || process.argv[3] === undefined) {
    console.log('Missing paramter!');
    console.log('Usage:');
    console.log('node server.js <APPID> <APPSECRET>');
    process.exit(1);
}
var APPID = process.argv[2];
var APPSECRET = process.argv[3];


var http = require('http'),
	https = require('https'),
	request = require('request'),
	url = require('url'),
	qs = require('querystring'),
	JSON = require('JSON'),
	AGO = require('./AGOconnection.js').AGO(APPID, APPSECRET);

var reportError, checkJob, writeOut, createDataObject, consoleResponse, standardResponse, RESPONSE, multipleRequests, checkForErrors;

http.createServer(function (req, res) {
	//CORS
    RESPONSE = res;
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");
	var thisReq, data, item, i,
        uri = url.parse(req.url).pathname,
        query = url.parse(req.url, true).query;
	switch (uri) {

    
    /*
        token - Return the token the app is using
    BAD EXAMPLE - NEVER PUT IN YOUR OWN APP
        You would normally *NEVER* have this operation in a web
        application - providing the token to clients gives the client
        the permissions of the application directly until token expiry
    */
	case '/token':
        writeOut(res, AGO.token, 'text');
        break;
	
    /*
        search - Search AGO for items.  
        Note that this returns only publicly shared items
    */
    case '/search':
        var q;
        q = {
            'f' : 'json',
            'token' : AGO.token,
            'q' : query.q
        };
        request({url: AGO.URLS.search, qs: q}, standardResponse);
        break;
    /*
        getItem - Get item information
        works for items shared publicly or owned by application owner
    */
    case '/getItem':
        item = query.item || '8543d1c1386f47c3b2bdac110f6015e7';
        data = {'f': 'json', 'token' : AGO.token};
        thisReq = request({
            'url' : AGO.portalURL + 'content/items/' + item,
            'qs' : data
        }, standardResponse);
        break;

    /*
        getData - run a query against a hosted feature service
        works for items shared publicly or owned by application owner
    */
    case '/getData':
        item = query.item || '8543d1c1386f47c3b2bdac110f6015e7';
        data = {'f': 'json', 'token' : AGO.token, 'where': '1=1', 'outFields': '*', 'returnGeometry': 'false'};
        thisReq = request({
            'url' : AGO.portalURL + 'content/items/' + item,
            'qs' : data
        }, function (err, resp, body) {
            var itemObj;
            itemObj = JSON.parse(body);
            request({'url': itemObj.url + '/0/query', 'qs': data}, standardResponse);

        });
        break;

    /*
        geocode - Single address geocode
        This is a free operation in ArcGIS Online
    */
    case '/geocode':
		var address;
		address = query.address || '8615 Westwood Center Drive, Vienna, VA 22182';
        data = createDataObject({'text': address});
		thisReq = request({'url' : AGO.URLS.geosearch, qs: data}, standardResponse);
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
        addressObj = {"records": []};
        for (i = 0; i < addressList.length; i = i + 1) {
            addressObj.records.push({
                "attributes": {
                    "OBJECTID": i + 1,
                    "SingleLine": addressList[i]
                }
            });
        }
        (JSON.stringify(addressObj));
        data = createDataObject({'addresses': JSON.stringify(addressObj)});
        thisReq = request({'url' : AGO.URLS.geocode, qs: data}, standardResponse);
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
        fromData = createDataObject({'text': fromAdddress});
        toData = createDataObject({'text': toAddress});
        requestURLs = [AGO.URLS.geosearch, AGO.URLS.geosearch];
        requestData = [fromData, toData];
        multipleRequests(requestURLs, requestData, function (responses) {
            var toRes, fromRes, toStop, fromStop, stops = [], data, e, errRes;
            if (checkForErrors(responses)) {
                toRes = JSON.parse(responses[0].body);
                toStop = toRes.locations[0].feature;
                toStop.attributes.name = toRes.locations[0].name;
                fromRes = JSON.parse(responses[1].body);
                fromStop = fromRes.locations[0].feature;
                fromStop.attributes.name = fromRes.locations[0].name;
                stops = [toStop, fromStop];
                data = createDataObject({stops: JSON.stringify({features: stops})});
                thisReq = request({'url': AGO.URLS.route, qs: data}, standardResponse);
            } else {
                for (e = 0; e < responses.length; e++) {
                    if (responses[e].error) {
                        errRes = responses[e];
                    }
                }
                reportError(errRes, 'Invalid geocode result');
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
            "spatialReference": {"wkid": 4326, "latestWkid": 4326},
            "features" : [
                {
                    geometry: {"x": parseFloat(x), "y": parseFloat(y)},
                    attributes: {"name" : name}
                }
            ]
        };
		//Other parameters
		//Distance - comes in as a comma-seperated string; split into units and run parseFloat on them
		distVals = query.distance || '5';
		distVals = distVals.split(',').map(function (val) {return parseFloat(val); });
		data = createDataObject({
            "facilities" : JSON.stringify(FC),
			"break_values" : distVals.join(' '),
			"break_units" : "Minutes"

        });
        thisReq = request({
            url: AGO.URLS.serviceArea + '/submitJob',
            qs: data
        }, function (err, resp, body) {
            var thisJobInfo = JSON.parse(body);
            if (thisJobInfo.jobId) {
                checkJob(AGO.URLS.serviceArea, thisJobInfo.jobId, res);
            } else {
                writeOut(res, body, 'json');
            }
        });

        break;
    case '/favicon.ico':
        RESPONSE.end();
        break;
	default:
		writeOut(res, uri, 'text');
        break;
	}
}).listen(8000);


//--- HELPER FUNCTIONS ---//

//checkJob - polls the staus of asynchronus tasks, grabs the result when ready
checkJob = function (taskURL, jobId, response) {
    var thisReqURL, data, thisReq;
    thisReqURL = taskURL + "/jobs/" + jobId + "/";
    data = createDataObject({'returnMessages': true});
	thisReq = request({url: thisReqURL, qs: data}, function (error, response, body) {
        var bodyObj;
        if (body) {
            bodyObj = JSON.parse(body);
            if (bodyObj.hasOwnProperty('jobStatus')) {
                if (['esriJobSubmitted', 'esriJobWaiting', 'esriJobExecuting'].indexOf(bodyObj.jobStatus) >= 0) {
                    setTimeout(checkJob, 1000, taskURL, jobId, response);
                } else if (bodyObj.jobStatus === 'esriJobSucceeded') {
                    request({'url': thisReqURL + '/results/Service_Areas', qs: data}, standardResponse);
                    //standardResponse(error, response, body);
                } else { reportError(response, 'Unspecifed error processing'); }
            } else {reportError(response, 'Unspecifed error processing'); }
        }
	});
};

// createDataObject - auto add token & json parameters
createDataObject = function (obj) {
    obj.f = 'json';
    obj.token = AGO.token;
    return obj;
};

/* 
    multipleRequests - handle situations where there are multiple
    requests being generated and the results are processed collectively
    
    Adapted from https://gist.github.com/natos/2001487 to return the 
    results in the order submitted and to allow query objects to be seperate
    from the URL
*/
multipleRequests = function (urls, data, callback) {
    var requests = [], results = [], resultsDict = {}, c = 0, i = 0, j = 0,
        handler = function (error, response, body) {
            var url = response.request.uri.href;
            resultsDict[url] = {error: error, response: response, body: body};
            if (++c === urls.length) {
                //Order the results to match input
                while (i < requests.length) {
                    results[i] = {error: requests[i].response.error, response: requests[i].response, body: requests[i].response.body};
                    i++;
                }
                callback(results);
            }
        };
    while (j < urls.length) {
        requests.push(request({url: urls[j], qs: data[j]}, handler));
        j++;
    }
};

// checkForErrors - check to see if any response in an array of responses has an error
checkForErrors = function (responses) {
    var c = responses.length;
    while (c--) {
        if (responses[c].error) { return false; }
    }
    return true;
};

// standardResponse - routes output
standardResponse = function (err, res, body) {
	consoleResponse(err, body);
	writeOut(RESPONSE, body, 'json');
};

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

// writeOut - write the body out as the server's response
writeOut = function (res, outThing, f) {
    console.log('============');
    //console.log(outThing);
    var formatHeader, outText,
        formats = {
            'json' : 'text/json',
            'html' : 'text/html',
            'text' : 'text/plain'
        };
    formatHeader = formats[f];
    res.setHeader('Content-Type', formatHeader);
    res.writeHead(200);
    if (f === 'json') {
        var outObj = JSON.parse(outThing);
        outText = JSON.stringify(outObj);
    } else {
        outText = outThing;
    }
    res.write(outText);
    res.end();
};

// reportError - return an error
reportError = function (res, comment) {
	RESPONSE.writeHead(400);
	RESPONSE.write(comment);
	RESPONSE.end();
};

