/*jslint browser:true */
var map;
require(["esri/map", "esri/layers/ArcGISDynamicMapServiceLayer", "dojo/domReady!"], function (Map, Layer) {
    map = new Map("map", {
        center: [-98.35, 39.5],
        zoom: 5,
        basemap: "streets"
    });
    var layer = new Layer("http://wdccivgis1.esri.com/arcgis/rest/services/1407_UC_JT/MarketAreas/MapServer");
    map.addLayer(layer);});