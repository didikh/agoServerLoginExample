/*jslint browser:true */
require(["esri/map", "esri/layers/ArcGISDynamicMapServiceLayer", "dojo/cookie", "dojo/dom", "dijit/registry", "dijit/form/Button", "dojo/domReady!"], function (Map, Layer, cookie, dom, registry, Button) {
    var myMap = new Map("map", {
        center: [-98.35, 39.5],
        zoom: 5,
        basemap: "streets"
    });
    var layer = new Layer("http://wdccivgis1.esri.com/arcgis/rest/services/1407_UC_JT/MarketAreas/MapServer");
    myMap.addLayer(layer);


    var username = cookie('username');
    if (typeof (username) === 'undefined') {
        require(["dijit/form/TextBox"],
            function (TextBox) {
                var agoURL, orgBox, loginButton;
                agoURL = dom.byId("arcgisURL");
                orgBox = new TextBox({
                    value: "www",
                    'class': "orgID",
                    intermediateChanges: true,
                    onChange: function () {
                        if (this.value !== 'www') agoURL.innerHTML = '.maps.arcgis.com';
                    }
                }, "orgBox").startup();
                loginButton = new Button({
                    label: "Login to ArcGIS Online Organization:",
                    onClick: function () {
                        var orgURL = "https://" + registry.byId('orgBox').value + agoURL.innerHTML;
                        var oAuthPath = "/sharing/oauth2/authorize";
                        var params = "client_id=zAPw1EhYp2NZFGT1&response_type=code&redirect_uri=http://jtedrick3.esri.com:7000/redirect.html";
                        window.open(orgURL + oAuthPath + "?" + params, "_self");
                    }
                }, "login").startup();

            });
    } else {
        //Put in Draw Button for Rectangle
        require(["esri/toolbars/draw", 'esri/request'], function (Draw, esriRequest) {
            var draw = new Draw(myMap);
            var drawButton = new Button({
                label: 'Draw your Area of Interest',
                onClick: function () {
                    draw.activate(Draw.EXTENT);
                    draw.on('draw-end', function (e) {
                        draw.deactivate();
                        var geomString = JSON.stringify(e.geometry.toJson());
                        var publishRequest = esriRequest({
                            url: '/publish',
                            content: {
                                f: "json",
                                extent: geomString
                            },
                            handleAs: 'json'
                        });
                        publishRequest.then(function (response) {
                            dom.byId('topBar').innerHTML = response.message;
                            cookie('username', null, {
                                expires: -1
                            });
                        });

                    });
                }
            }, 'drawButton').startup();
        });
    }
});