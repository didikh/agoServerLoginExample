/*jslint node: true, devel: true, vars:true, plusplus:true */
"use strict";

if (process.argv[2] === undefined || process.argv[3] === undefined) {
    console.log('Missing paramter!');
    console.log('Usage:');
    console.log('node serverUserLogin.js <APPID> <APPSECRET>');
    process.exit(1);
}

var APPID = process.argv[2];
var APPSECRET = process.argv[3];


var http = require('http'),
    https = require('https'),
    fs = require('fs'),
    request = require('request'),
    url = require('url'),
    qs = require('querystring'),
    jade = require('jade'),
    JSON = require('JSON'),
    AGO = require('./AGOconnection.js'),
    CONFIG = require('./config.js');

var LOGIN = AGO.userLogin(APPID, APPSECRET);
var loginCache = {};
var config = CONFIG.config();

//Functions
var getFile, sendMessage, onToken, getData, checkFolder, createFolder, addItem, publishItem, createDataObject, multipleRequests, checkForErrors, reportError;

http.createServer(function (req, res) {
    //CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

    var thisReq, data, item, i, cookies = {},
        username = "",
        uri = url.parse(req.url).pathname,
        query = url.parse(req.url, true).query,
        rawCookies = req.headers.cookie;

    rawCookies && rawCookies.split(";").forEach(function (c) {
        if (c.trim().indexOf('username=' === 0)) {
            username = c.split('=')[1];
        }
    });
    switch (uri) {
    case "/":
    case "/index.html":
        getFile('index.jade', username, res);
        break;
    case "/redirect.html":
        LOGIN.getToken(req.url, config.redirectURL, onToken, res);
        break;
    case "/publish":
        console.log('Recevied request from ' + username + 'for:');
        console.log(query);
        getData(query.extent, username, res);
        sendMessage({
            'status': 'processing',
            'message': 'Thanks ' + loginCache[username].name + ' -we are processing your request.'
        }, 'json', res);
        break;
    case '/favicon.ico':
        res.end();
        break;
    default:
        getFile(uri.substr(1), username, res);
        break;
    }


}).listen(7000);

getFile = function (file, username, res) {
    var suffix, outText;
    suffix = file.substr(file.lastIndexOf(".") + 1);
    if (suffix === 'jade') {
        var user = {
            username: "",
            name: ""
        };
        if (username !== "" && loginCache.hasOwnProperty(username)) {
            user = {
                username: username,
                name: loginCache[username].name
            };
        }
        outText = jade.renderFile('templates/' + file, {
            pretty: true,
            globals: user
        });
    } else {
        outText = fs.readFileSync('templates/' + file, {
            'encoding': 'utf8'
        });
    }

    res.setHeader('Content-Type', config.formats[suffix]);
    res.writeHead(200);
    res.write(outText);
    res.end();
};
sendMessage = function (msg, f, res) {
    res.setHeader('Content-Type', config.formats[f]);
    res.writeHead(200);
    var msgText = msg;
    if (f == 'json') {
        msgText = JSON.stringify(msg);
    }
    res.write(msgText);
    res.end();
};
onToken = function (tokenObj, res) {
    if (tokenObj === null || !tokenObj.hasOwnProperty('access_token')) {
        reportError(res, "Could not get token");
    } else {
        var username = tokenObj.username;
        loginCache[username] = tokenObj;
        loginCache[username].folderID = "";
        //Get user's name 
        request({
                'url': AGO.arcgisURLs.portalURL + 'portals/self',
                qs: createDataObject(tokenObj.username)
            },
            function (err, response, body) {
                if (!err) {
                    var resJSON = JSON.parse(body);
                    loginCache[username].name = resJSON.user.fullName;
                    var outText;
                    outText = jade.renderFile('templates/redirect.jade', {
                        pretty: true,
                        globals: {
                            username: username,
                            name: loginCache[username].name
                        }
                    });
                    res.setHeader('Content-Type', 'text/html');
                    res.writeHead(200);
                    res.write(outText);
                    res.end();
                } else {
                    reportError(res, "Could not find you");
                }
            });
        //Check for publish folder
        checkFolder(username, config.foldername);
    }



};

getData = function (extentString, username, res) {
    //Set up multiple requests - layer description & query for featureset
    var requestURLs = [config.serviceURL, config.serviceURL + '/query'];
    var requestData = [{
        'f': 'json'
    }, {
        "geometry": extentString,
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": 'true',
        'f': 'json'
    }];
    multipleRequests(requestURLs, requestData, function (responses) {
        if (checkForErrors(responses)) {
            var layerInfo = JSON.parse(responses[0].body);
            var queryResult = JSON.parse(responses[1].body);
            var ldProps = ['geometryType', 'name', 'type'];
            var layerDefinition = {};
            ldProps.forEach(function (prop) {
                if (layerInfo.hasOwnProperty(prop)) {
                    layerDefinition[prop] = layerInfo[prop];
                }
            });
            //drawingINfo & renderer
            layerDefinition.drawingInfo ={
                "fixedSymbols":true,
                    "renderer":layerInfo.drawingInfo.renderer
            };
            
            //Get fields and objectIdField from field list
            layerDefinition.fields = [];
            //Also Set up basic popups
            var popupInfo = {
                fieldInfos: [],
                mediaInfos: [],
                showAttachments: false
            };
            layerInfo.fields.forEach(function (f) {
                if (f.type === "esriFieldTypeOID") {
                    layerDefinition.objectIdField = f.name;
                }
                layerDefinition.fields.push({
                    name: f.name,
                    alias: f.name,
                    type: f.type
                });
                popupInfo.fieldInfos.push({
                    fieldName: f.name,
                    isEditable: true,
                    label: f.name,
                    stringFieldOptions: "textbox",
                    tooltip: "",
                    visible: true
                });
            });
            var featureSet = {
                features: queryResult.features,
                geometryType: queryResult.geometryType,
                spatialReference: queryResult.spatialReference
            };
            featureSet.features.forEach(function (f) {
                f.geometry.spatialReference = queryResult.spatialReference;
            });
            var featureCollection = {
                "featureCollection": {
                    "layers": [{
                        layerDefinition: layerDefinition,
                        featureSet: featureSet,
                        popupInfo: popupInfo
                }],
                    "showLegend": true
                }
            };
            addItem(username, featureCollection, 'Feature Collection');
        } else {
            console.log('Error getting data');
            console.log(responses[0].body);
            console.log(responses[1].body);
        }
    });
};
addItem = function (username, data, itemType) {
    console.log('adding item as feature collection');
    var addItemURL = AGO.arcgisURLs.users + username + "/" + loginCache[username].folderID + '/addItem';
    var addParams = {
        'text': JSON.stringify(data),
        'type': itemType,
        'title': 'FC from app - ' + new Date().toUTCString(),
        'tags': 'intermediate,oAuth',
        'description': 'Feature Collection from oAuth to publish',
        'snippet': 'Feature Collection from oAuth to publish',
        'extent': "-125,24,-66,49.25",
        'spatialReference':"{\"wkid\":3857}",
        'culture':'en-us'
    };
    //console.log(addParams);
    request.post({
        url: addItemURL,
        qs: createDataObject(username),
        form: addParams
    }, function (err, res, body) {
        if (!err) {
            //console.log(res.headers);
            var bodyJSON = JSON.parse(body);
            console.log(bodyJSON);
            if (bodyJSON.success === true) {
                publishItem(username, bodyJSON.id);
            } else {
                console.log('Failed to add feature collection');
            }
        } else {
            console.log('error adding item');
        }
    });
};
publishItem = function (username, item) {
    var publishItemURL = AGO.arcgisURLs.users + username + '/publish';
    var publishParams = {
        itemID: item,
        filetype: 'featurecollection',
        publishParameters: JSON.stringify({
            "hasStaticData": true,
            "name": 'Features' + item.substr(0, 16),
            "maxRecordCount": 2000,
            "layerInfo": {
                "capabilities": "Query"
            }
        })
    };

    request.post({
        url: publishItemURL,
        qs: createDataObject(username),
        form: publishParams
    }, function (err, res, body) {
        if (!err) {
            var bodyJSON = JSON.parse(body);
            console.log(bodyJSON);
            var statusURL = 'http://www.arcgis.com/sharing/rest/content/users/' + username + '/items/' + bodyJSON.services[0].serviceItemId + '/status?';
            console.log(" ");
            console.log(statusURL);
            console.log('token=' + loginCache[username].access_token);
            console.log('&jobId=' + bodyJSON.services[0].jobId);
            console.log("&f=pjson");
        } else {
            console.log('Failed to publish service');
        }

    });
};

checkFolder = function (username, foldername) {
    //Check to see if the folder exists
    request({
        url: AGO.arcgisURLs.users + username,
        qs: createDataObject(username)
    }, function (err, response, body) {
        if (!err) {
            var folderID = "";
            var bodyJSON = JSON.parse(body);
            bodyJSON.folders.forEach(function (f) {
                if (f.title === foldername) {
                    folderID = f.id;
                }
            });
            if (folderID !== "") {
                loginCache[username].folderID = folderID;
            } else {
                createFolder(username, foldername);
            }
        } else {
            console.log('Cannot scan folders');
        }
    });

};

createFolder = function (username, foldername) {
    var params = createDataObject(username, {
        title: config.foldername
    });
    request({
            url: AGO.arcgisURLs.users + username + "/createFolder",
            form: params,
            method: 'POST'
        },
        function (err, response, body) {
            if (!err) {
                var bodyJSON = JSON.parse(body);
                if (bodyJSON.success) {
                    loginCache[username].folderID = bodyJSON.folder.id;
                } else {
                    console.log('Could not make folder');
                    console.log(body);
                }
            } else {
                console.log('Could not make folder');
                console.log(err);
                console.log(body);
            }
        }
    );

};

createDataObject = function (username, obj) {
    if (typeof (obj) === 'undefined') {
        obj = {};
    }
    obj.f = 'json';
    obj.token = loginCache[username].access_token;
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

checkForErrors = function (responses) {
    var c = responses.length;
    while (c--) {
        if (responses[c].error) {
            return false;
        }
    }
    return true;
};

reportError = function (res, comment) {
    res.writeHead(400);
    res.write(comment);
    res.end();
};