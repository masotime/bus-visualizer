// strips properties from geoJSON files
'use strict';

var fs = require('fs'),
	sourceFile, targetFile;

if (process.argv.length < 3) {
	console.log('Please specify the path to the JSON file');
	process.exit(0);
}  else {
	sourceFile = process.argv[2];
	targetFile = sourceFile.replace(/\.json$/,'_min.json');

	fs.readFile(sourceFile, function(err, str) {
		var json = JSON.parse(str);
		json.features.forEach(function(feature) {
			delete feature.properties;
		});
		fs.writeFile(targetFile, JSON.stringify(json));
	});


}
