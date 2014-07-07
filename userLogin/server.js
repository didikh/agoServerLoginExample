/*jslint node: true, devel: true, vars:true, plusplus:true */
"use strict";

var appInfo = {};
appInfo = require('../appSettings.js');
// Comment the line above to run interactively
//if (process.argv[2] !== undefined || process.argv[3] !== undefined) {
//    appInfo = {
//        appId : process.argv[2],
//        appSecret : process.argv[3]
//        appInfo.redirect_uri : "" //Insert redirect uri
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
    reqUtils = require('../libs/requestUtils').utils(),
    config = require('./config.js').config;
//
var LOGIN = AGO.userLogin(appInfo.appId, appInfo.appSecret);
var loginCache = {};
//var config = CONFIG.config();

//Functions
var getFile, sendMessage, onToken, getData, checkFolder, createFolder, addItem, publishItem, createDataObject;

http.createServer(function (req, res) {
    //CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

    var username = "",
        uri = url.parse(req.url).pathname,
        query = url.parse(req.url, true).query,
        rawCookies = req.headers.cookie,
        redirect_uri = (appInfo.popup) ? appInfo.redirect_uri + 'userLogin/redirect.popup.html' : appInfo.redirect_uri + 'userLogin/redirect.html',
        vars;

    uri = uri.substr(uri.indexOf('userLogin') + 9);
    console.log(uri);
    
    if (rawCookies) {
        rawCookies.split(";").forEach(function (c) {
            if (c.trim().indexOf('username=' === 0)) {
                username = c.split('=')[1];
            }
        });
    }
    vars = (username !== "" && loginCache.hasOwnProperty(username)) ? loginCache[username] : {};
//    console.log('user');
//    console.log(username);
//    console.log(thisUser);
//    console.log(loginCache);
    switch (uri) {
    case "/":
    case "/index.html":
        vars.redirect_uri = redirect_uri;
        vars.popup = appInfo.popup;
        reqUtils.getFile(res, 'index.jade', vars);
        console.log(rawCookies);
        break;
    case "/redirect.popup.html":
    case "/redirect.html":
        console.log('OAuth redirection for ' + username);
        LOGIN.getToken(req.url, redirect_uri, onToken, res);
        break;
    case "/publish":
        console.log('Recevied request from ' + username + ' for:');
        console.log(query);
        getData(query.extent, username, res);
        reqUtils.sendMessage(res, {
            'status': 'processing',
            'message': 'Thanks ' + loginCache[username].name + '- we are processing your request.'
        }, 'json');
        break;
    case '/source.html':
//        var file, css, fileList = [];
//        file = query.file;
//        css = query.css || 'default';
//        //Build the file list
//        var thisDir = fs.readdirSync(__dirname);
//        for(var f=0; f < thisDir.length; f++) {
//            var thisFile = thisDir[f];
//            if (thisFile.substr(-3) === ".js") {
//                fileList.push(thisFile);
//            }
//        }
//        fileList.push('requestUtils.js');
//        fileList.push('AGOconnection.js');
//        reqUtils.getSource(res, file, css, fileList);
        reqUtils.getSource(res, query.file, query.css, __dirname);
        break;
    case '/favicon.ico':
        res.end();
        break;
    default:
        reqUtils.getFile(res, uri.substr(1), vars);
        break;
    }


}).listen(process.env.PORT);

onToken = function (tokenObj, res) {
    if (tokenObj === null || !tokenObj.hasOwnProperty('access_token')) {
        reqUtils.reportError(res, "Could not get token");
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
                    var vars = loginCache[username];
                    vars.popup = appInfo.popup
                    
                    reqUtils.getFile(res, 'redirect.jade', vars);
                } else {
                    reqUtils.reportError(res, "Could not find you");
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
    reqUtils.multipleRequests(requestURLs, requestData, function (responses) {
        if (reqUtils.checkForErrors(responses)) {
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
            layerDefinition.drawingInfo = {
                "fixedSymbols": true,
                "renderer": layerInfo.drawingInfo.renderer
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
        'spatialReference': "{\"wkid\":3857}",
        'culture': 'en-us'
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
            if (bodyJSON.success === true) {
                console.log('Item added - http://www.arcgis.com/home/item.html?id=' + bodyJSON.id);
                //publishItem(username, bodyJSON.id);
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

