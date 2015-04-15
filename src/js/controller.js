var controllers = angular.module('controllers', [])
     .filter('sumOfValue', function () {
        return function (data, key) {
            if (typeof (data) === 'undefined' && typeof (key) === 'undefined') {
                return 0;
            }
            var sum = 0;
            for (var i in data) {
                sum = sum + ( data[i][key] - 0 );
            }
            //console.log("sumOfValue-- "+key+"::"+sum);
            return sum;
        }
    });
controllers.controller('tsmSlackController', ['$scope', '$http', '$routeParams',
  function ($scope, $http, $routeParams) {
    var c = $scope;
    c.RP = $routeParams;
    c.h1 = "Capex "+c.RP.market;
    c.h2 = c.RP.year;
    c.uriprefix = makeLinkPrefix();
    c.dataprefix = makeDataLinkPrefix();
    c.replaceFile = function(z){ replaceFile(z); }
    c.removeRow = function(z){ if ( confirm('Remove '+z.campaign_name__1+"?") ) { z.hidden = true; removeRow(z); } }
}]);

function updateThis(u, p) {
    var request = $.ajax({
      url: u,
      type: "PUT",
      data: p,
      dataType: "json"
    });
    console.log ('updateThis sent '+JSON.stringify(p)+' to '+u+' and returned '+JSON.stringify(request));
}

function isNumeric( obj ) {
    return !jQuery.isArray( obj ) && (obj - parseFloat( obj ) + 1) >= 0;
}
function makeLinkPrefix(){ //wp-angular hybrid appears inside the /projx folder
    return ( window.location.pathname.indexOf('projx') === -1 ) ? "/capital/#" : "/projx/?jx=capexApp#";
}
function makeDataLinkPrefix(){ // harry needs prod data visible on his local
    return ( window.location.host === "localhost:8888" ) ? "https://townsquarelab.com" : "" ;
}
/* this is handled with sumOfValue filters in the ng templates
function getQuarterlyData(mybudgeData){ // DRY
    var arrayLength = mybudgeData.length;
    var Yeartotal = 0;
    var my_q1 = 0;
    var my_q2 = 0;
    var my_q3 = 0;
    var my_q4 = 0;
    for (var i = 0; i < arrayLength; i++) {
        v1 = parseFloat(mybudgeData[i].Q1);
        if (!isNaN(v1)) my_q1 += v1;
        v2 = parseFloat(mybudgeData[i].Q2);
        if (!isNaN(v2)) my_q2 += v2;
        v3 = parseFloat(mybudgeData[i].Q3);
        if (!isNaN(v3)) my_q3 += v3;
        v4 = parseFloat(mybudgeData[i].Q4);
        if (!isNaN(v4)) my_q4 += v4;
    }
    Yeartotal = (my_q1+my_q2+my_q3+my_q4);
    return [Yeartotal, my_q1, my_q2, my_q3, my_q4];
} */

function getPlannedData(myData){ // DRY
    var arrayLength = myData.length;
        var execPlanned = 0;
        var execUnPlanned = 0;
        for (var i = 0; i < arrayLength; i++) {
            // console.log(c.mainData[i].MarketQ1);
            v1 = parseFloat(myData[i].PlannedTotal);
            if (!isNaN(v1)) execPlanned += v1;
            v2 = parseFloat(myData[i].UnplannedTotal);
            if (!isNaN(v2)) execUnPlanned += v2;
        }
        return [execPlanned, execUnPlanned];
}

function onlyUnique(value, index, self) { 
    return self.indexOf(value) === index;
}

