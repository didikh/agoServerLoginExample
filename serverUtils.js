/*jslint nomen: true, node: true, devel: true */
"use strict";

var utils = function() {
    /* 
        multipleRequests - handle situations where there are multiple
        requests being generated and the results are processed collectively

        Adapted from https://gist.github.com/natos/2001487 to return the 
        results in the order submitted and to allow query objects to be seperate
        from the URL
    */
    this.multipleRequests = function (urls, data, callback) {
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
    
}

exports.utils = function(){return new utils();}