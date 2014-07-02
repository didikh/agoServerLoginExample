exports.config = function () {
    return {
        serviceURL: "http://wdccivgis1.esri.com/arcgis/rest/services/1407_UC_JT/MarketAreas/MapServer/0",
        foldername: "Market Report by Tedrick",
        redirectURL: 'http://jtedrick3.esri.com:7000/redirect.html',
        formats: {
            'json': 'text/json',
            'html': 'text/html',
            'txt': 'text/plain',
            'css': 'text/css',
            'js': 'text/javascript',
            'jade': 'text/html'
        }
    };
};