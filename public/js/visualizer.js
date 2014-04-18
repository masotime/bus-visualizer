'use strict';

var containerSelector = 'div#visual-container';
var RendererFactory = (function(selector, width, height) {
	var svg = d3.select(selector).append('svg'),
		pathCache = {},
		previousBounds,
		aspectRatio = width / height;

	// see http://stackoverflow.com/a/9539361 for responsive stuff		
	svg.attr('width', width)
	   .attr('height', height)
	   .attr('viewBox', '0 0 '+width+' '+height)
	   .attr('preserveAspectRatio', 'xMidYMid');

	var resize = function(targetWidth) {
		svg.attr('width', targetWidth)
		   .attr('height', targetWidth / aspectRatio);
	};

	var remove = function(key) {
		svg.selectAll('path.'+key).remove();
		svg.selectAll('.place-label-'+key).remove();
	};

	// see https://github.com/mbostock/d3/wiki/Geo-Paths for API information
	var renderGEOJson = function(className, stroke, label) {
		var finalProjection;

		if (!className) {
			throw new Error("Specify a valid classname to render these paths");
		}

		var calculateGlobalBounds = function() {
			// based upon cached paths, calculate global bounds and determine a universal
			// projection for all of them
			var allfeatures = [], key;

			for (key in pathCache) {
				allfeatures = allfeatures.concat(pathCache[key].features);
			}

			// lots of references to http://stackoverflow.com/a/14691788
		 	var projection = d3.geo.albers().scale(1).translate([0, 0]);
			var path = d3.geo.path().projection(projection);
			var bounds = path.bounds({type: "FeatureCollection", features: allfeatures});

			return bounds;

		}

		var generatePath = function(featureCollection) {
			var globalBounds, x1, x2, y1, y2, s, t, path;

			// store the paths inside the cache....
			pathCache[className] = featureCollection;

			globalBounds = calculateGlobalBounds();

			// lots of references to http://stackoverflow.com/a/14691788
			// 1. scale must match the larger of (x2-x1)/width, (y2-y1)/height
			x1 = globalBounds[0][0];
			x2 = globalBounds[1][0];
			y1 = globalBounds[0][1];
			y2 = globalBounds[1][1];

			s = 1.1/Math.max((x2-x1)/width, (y2-y1)/height);
			t = [(width - s * (x1+x2))/2, (height - s * (y1+y2))/2];

			// create a new projection and path to use
		 	finalProjection = d3.geo.albers().scale(s).translate(t);
			path = d3.geo.path().projection(finalProjection);
			path.pointRadius(3);

			// return the path
			return path;
		}

		var renderPath = function(key, path) {
			var svgpath, labelPoints;

			svg.selectAll('path.'+key).remove();
			
			svgpath = svg.selectAll('path.'+key)
				.data(pathCache[key].features)
				.enter().append('path')

			svgpath.attr('d', path).attr('class', key);

			if (stroke) {
				svgpath.attr('stroke', stroke)
					.attr('stroke-width', '1');
			}

			if (label) {
				// adapted from http://bost.ocks.org/mike/map/#displaying-places				
				svg.selectAll('.place-label-'+key).remove();
				labelPoints = svg.selectAll('.place-label-'+key)
					.data(pathCache[key].features)
					.enter();

				labelPoints.append('rect')
						.attr('class', 'place-label-'+key+' place-background')
						.attr('transform', function(d) { return "translate(" + finalProjection(d.geometry.coordinates) + ")"; })
						.attr('width', '1em')
						.attr('height', '10px')
						.attr('y', '-.35em')
						.attr('x', '.2em');				

				labelPoints.append('text')
						.attr('class', 'place-label-'+key+' place-label')
						.attr('transform', function(d) { return "translate(" + finalProjection(d.geometry.coordinates) + ")"; })
						.attr('dy', '.35em')
						.attr('dx', '.5em')
						.text(function(d) { return label; });
			}

		}

		return function(err, featureCollection) {
			var path, currentBounds, refreshAll, key, 
				lowerBoundsSame, upperBoundsSame;
			
			if (err) console.error(err);

			// generate a path with global bounds
			path = generatePath(featureCollection);

			// calculate the current bounds
			currentBounds = calculateGlobalBounds();
			refreshAll = false;

			// compare against the previous bounds
			if (previousBounds) {
				lowerBoundsSame = previousBounds[0][0] === currentBounds[0][0] && previousBounds[0][1] === currentBounds[0][1];
				upperBoundsSame = previousBounds[1][0] === currentBounds[1][0] && previousBounds[1][1] === currentBounds[1][1];
				if (lowerBoundsSame && upperBoundsSame) {
					console.log('Full refresh NOT needed');
				} else {
					console.log('Full refresh needed');
					if (!lowerBoundsSame) {
						console.log('Lower bounds do not match.',previousBounds[0],'vs',currentBounds[0]);
					} else {
						console.log('Upper bounds do not match.',previousBounds[1],'vs',currentBounds[1]);
					}
					refreshAll = true;
				}
			}

			// update previousBounds
			previousBounds = currentBounds;

			// the path will automatically use the new projection
			// console.log('scaled bounds = ',JSON.stringify(path.bounds(featureCollection), null, 4));

			if (refreshAll) {
				// rerender all paths in the cache
				for (key in pathCache) {
					renderPath(key, path);
				}
			} else {
				renderPath(className, path);
			};

		}
	};

	return {
		'render': renderGEOJson,
		'resize': resize,
		'remove': remove
	}
});

var URL = 'http://webservices.nextbus.com/service/publicXMLFeed',
	PAYLOAD_DATA = {
		vehicleLocations: function(agency, route, time) {
			agency = agency || 'sf-muni';
			route = route || '30';

			// use yesterday if not specified
			// stolen from http://stackoverflow.com/a/5511591
			time = time || ((function(d){ d.setDate(d.getDate()-1); return d})(new Date)).getTime();

			return {
				command: 'vehicleLocations',
				a: agency,
				r: route,
				t: time
			}
		},
		agencyList: function() {
			return {
				command: 'agencyList'
			}
		},
		routeList: function(agency) {
			agency = agency || 'sf-muni';
			return {
				command: 'routeList',
				a: agency
			}
		}
	};

// encapsulate "threads" spawned
var TimerFactory = (function(renderer) {
	var threadStatus = {};

	var threadMaker = function(id, agency, route, className, refresh) {
		console.log('Creating thread',id,'| agency = ',agency,'| route = ',route,'| className =',className,'| refresh =',refresh);
		refresh = refresh || 15000; // default

		var thread = function() {

			// do ajax, etc.
			$.get(URL, PAYLOAD_DATA.vehicleLocations(agency, route, 0))
				.done(function(data) {
					var vehicles, vehicle, lastTime, features, feature, i;
					vehicles = data.getElementsByTagName('vehicle');
					lastTime = data.getElementsByTagName('lastTime')[0].getAttribute('time');
					// console.log(vehicles);

					// convert XML Doc to GeoJSON format
					features = [];

					for (i=0; i < vehicles.length; i+=1) {
						vehicle = vehicles[i];
						feature = {
							type: "Feature",
							properties: {},
							geometry: {
								type: "Point"
							}
						};

						// boring data transfer
						feature.properties['id'] = vehicle.getAttribute('id');
						feature.properties['routeTag'] = vehicle.getAttribute('routeTag');
						feature.properties['dirTag'] = vehicle.getAttribute('dirTag');
						feature.geometry.coordinates = [];
						feature.geometry.coordinates.push(parseFloat(vehicle.getAttribute('lon')));
						feature.geometry.coordinates.push(parseFloat(vehicle.getAttribute('lat')));
						feature.geometry.coordinates.push(0.0);
						feature.properties['secsSinceReport'] = parseInt(vehicle.getAttribute('secsSinceReport'));
						feature.properties['predictable'] = vehicle.getAttribute('predictable');
						feature.properties['heading'] = vehicle.getAttribute('heading');
						feature.properties['speedKmHr'] = vehicle.getAttribute('speedKmHr');

						features.push(feature);

					}

					// check the status. if it signals a stop, then don't try and render and reschedule
					if (threadStatus[id]) {
						// render on the canvas now
						renderer.render(className, 'white', route)(null, {
							type: "FeatureCollection",
							features: features
						});

						// console.log(features);
						// reschedule
						setTimeout(thread, refresh);					
					} else {
						console.log('Stopping thread',id);
						renderer.remove(className);
						delete threadStatus[id];
					};
				}).fail(function() {
					// if we are still alive, we retry again
					if (threadStatus[id]) {
						console.log('Retrying thread',id,'again...');
						setTimeout(thread, refresh);
					};
				}); // end $.get
			
		}; // end thread function

		return thread;
	};

	var spawn = function(agency, routes, refresh) {
		var id = (new Date()).getTime();

		// mark all other threads as off
		resetAll();

		// make routes always an array
		if (!Array.isArray(routes)) {
			routes = [routes];
		}

		// track the new thread(s)
		threadStatus[id] = true;

		// create the threads for each route and start them and start it
		routes.forEach(function(route, idx) {
			if (route !== null) {
				var thread = threadMaker(id, agency, route, 'bus-'+(idx+1), refresh);
				thread();
			}
		});
	};

	var resetAll = function() {
		var threadId;

		for (threadId in threadStatus) {
			threadStatus[threadId] = false;
		}
	};

	return {
		'spawn': spawn,
		'resetAll': resetAll
	};
});

// this is where stuff actually starts happening
var renderer = RendererFactory(containerSelector, document.documentElement.clientWidth*0.9, document.documentElement.clientWidth *0.9* 1.2);

var maps = [ 'streets_min' ,'arteries', 'freeways', 'neighborhoods' ];
d3.json('/sfmaps/' + maps[0] +'.json', function(err, result) {
	$(function() {
		$('#loading').hide();
		$('#loaded').show();
		renderer.render(maps[0])(err, result);
	});
});

$(function() {
	var $agencyDropdown = $('select[name="agency"]'),
		$routeDropdown = $('select[name="route"]'),
		timer = TimerFactory(renderer);

	// load agencies (one-time)
	/*
	$.get(URL, PAYLOAD_DATA.agencyList(), function(data, textStatus, jqXHR) {
		var agencies = data.getElementsByTagName('agency'),
			i, agency, $option;

		for (i=0; i < agencies.length; i+=1) {
			agency = agencies[i];
			$option = $('<option></option>');

			$option.val(agency.getAttribute('tag'));
			$option.text(agency.getAttribute('title'));

			$agencyDropdown.append($option);
		}
		
	});
	*/

	// It seems like there's only one or two agencies of note in SF....
	$agencyDropdown.append('<option value="sf-muni">San Francisco Muni</option>');
	$agencyDropdown.append('<option value="ucsf">University of California San Francisco</option>');
	$agencyDropdown.select2();

	// initially, the routeDropdown is hidden
	$routeDropdown.hide();

	// load routes for given agency
	$agencyDropdown.on('change', function() {
		var agency = $agencyDropdown.val();

		// always clear the routes
		$routeDropdown.empty().hide();
		timer.resetAll();

		if (agency !== '') {
			$.get(URL, PAYLOAD_DATA.routeList(agency), function(data, textStatus, jqXHR) {
				var routes = data.getElementsByTagName('route'),
					i, route, $option;

				for (i=0; i < routes.length; i+=1) {
					route = routes[i];
					$option = $('<option></option>');

					$option.val(route.getAttribute('tag'));
					$option.text(route.getAttribute('title'));

					$routeDropdown.append($option);
				}

				// show the dropdown and apply select2
				$routeDropdown.show().select2({placeholder: 'Select routes'});

			});
		}

	});

	$routeDropdown.on('change', function() {
		timer.spawn($agencyDropdown.val(),$routeDropdown.val(),5000);
	});

	// responsive resize, see 
	$(window).on('resize', function() {
		renderer.resize(document.documentElement.clientWidth * 0.9);
	})

});