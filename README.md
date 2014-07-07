agoServerLoginExample
============

Example of using OAuth User and Application Logins on the server with ArcGIS Online.

This is a Node Server application that serves as a proxy to ArcGIS Online.

Steps to make it work:  
1.  Download/Clone to your server  
2.  Run `npm install` to install the libraries (request and JSON)  
3.  Register as an application in ArcGIS Online (if you're not already in an ArcGIS Online organization, goto [developers.arcgis.com](https://developers.arcgis.com/en/plans/) to get a developer account  
4.  Get the application ID and application secret  
5.  Deploy:
    a. Option A : run each server with `node server.js <APP ID> <APP SECRET>` in the servers folders- you'll need to set the port in server.js
    b. Option B : use [iisnode](https://github.com/tjanczuk/iisnode) module to deploy on IIS

This application is provided as a demo at the [Esri DC DevSummit](http://www.esri.com/events/devsummit-dc) and further refined with user logins for the [Esri 2014 UC](http://www.exrit.com/events/uc).
