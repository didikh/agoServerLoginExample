/*jslint browser:true */
var R;

require(["esri/map", 'esri/graphic', "esri/symbols/SimpleLineSymbol", "esri/Color", 'esri/request', "dojo/dom", "dojo/_base/array", "dijit/form/Button", "dijit/form/TextBox", "dojo/domReady!"], function (Map, Graphic, SLS, Color, esriRequest, dom, array, Button, TextBox) {
    var goButton, fromBox, toBox;
    var myMap = new Map("map", {
        center: [-77.5, 38.5],
        zoom: 5,
        basemap: "streets"
    });
    
    fromBox = new TextBox({placeholder: "From Address"}, "fromBox");
    
    toBox = new TextBox({placeholder: "To Address"}, "toBox");

    goButton = new Button({
        label: 'Submit!',
        onClick: function () {
            var routeReq = esriRequest({
                    url: './route2',
                            content: {
                                f: "json",
                                from: fromBox.value,
                                to:toBox.value
                            },
                            handleAs: 'json'
                        });
            routeReq.then(function(response){
                var results = JSON.parse(response);
                R = [response, results];
                var route = new Graphic(results.routes.features[0]);
                route.setSymbol(new SLS(SLS.STYLE_SOLID, new Color([0,0,255]), 3));
                var directions = results.directions[0];
                myMap.graphics.add(route);
                myMap.setExtent(route.geometry.getExtent().expand(1.5));
                var directionItems = array.map(directions.features, function(item){
                    return "<li>"+item.attributes.text+"</li>";
                });
                var directionText = "<ol>" + directionItems.join("\n") + "</ol>";
                dom.byId("rightBox").innerHTML = directionText;
                console.log(response);});
        }
    }, "goButton");
    
});