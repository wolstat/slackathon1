var tsmSlackApp = angular.module("tsmSlackApp", ['ngRoute', 'controllers']);

tsmSlackApp.run(function(editableOptions, editableThemes) {
  editableOptions.theme = 'bs3';
  editableThemes.bs3.inputClass = 'input-sm';
  editableThemes.bs3.buttonsClass = 'btn-sm';
  //editableOptions.mode = 'popup';
  //editableOptions.xeditable
}); // bootstrap3 theme. Can be also 'bs2', 'default' //test mike 4

tsmSlackApp.config(['$routeProvider', '$httpProvider',
  function($routeProvider, $httpProvider) {
    //initialize get if not there
    if (!$httpProvider.defaults.headers.get) {
        $httpProvider.defaults.headers.get = {};    
    }
    //disable IE ajax request caching
    // $httpProvider.defaults.headers.get['If-Modified-Since'] = '0';
    //test comment

    $routeProvider.
     otherwise({
        templateUrl: '../template.htm',
        controller: 'tsmSlackController'
      });
  }]);


tsmSlackApp.filter('dataFieldVal', function() {//filter data by a field/value
  return function(dataset, fieldname, fieldvalue, inout) { //inout: toggle in or out of set
    //console.log("I am in phonecatFilters !!!!!!!!!"+allProj[0]._id);
    var entry, results = [];
    for (entry in dataset) {
      if (inout) {
        if ( dataset[entry][fieldname] && dataset[entry][fieldname] === fieldvalue) results.push( dataset[entry] );
      } else {
        if ( dataset[entry][fieldname] && dataset[entry][fieldname] !== fieldvalue ) results.push( dataset[entry] );
      }
    }
    return results;
  };
});

tsmSlackApp.filter('numberK', function ($filter) {
    return function (input, fractionSize) {
      result = $filter('number')( ( input / 1000 ), fractionSize);
      //console.log("fK"+result+" typeof "+typeof result);
      return (result === '') ? '0' : result;
    };
});

tsmSlackApp.filter('filterQ', function () {
    return function (data, Q, arg) {
        var i, results = [], dateField = arg.dateField, RPyear = arg.RPyear;
        for (i in data) {
          var dateArr = data[i][dateField].split('/'), dMonth = ( dateArr[0] - 0 ), dYear = dateArr[2], dQ = ( Math.ceil( dMonth / 3 ) + "");
            console.log("$filter filterQ dMonth::"+dMonth+" RPyear::"+RPyear+" dYear::"+dYear+" dQ::"+dQ+" Q::"+Q);
          if ( dYear === RPyear && dQ === Q ) { //Q can only be in this year
            console.log("$filter filterQ dMonth::"+dMonth+" RPyear::"+RPyear+" dYear::"+dYear+" dQ::"+dQ+" Q::"+Q);
            //console.log("$filter filterQ sum::"+sum+"  id_::"+data[i].id_+" RPyear::"+RPyear+" dYear::"+dYear+" dQ::"+dQ+" Q::"+Q);
            results.push( data[i] );
          }
        }        
      return results;
    }
});

tsmSlackApp.filter('dataNormal', function() {//backfill empty string values against a list of fieldnames
  return function(dataset, fieldnames) { //inout: toggle in or out of set
    //console.log("I am in phonecatFilters !!!!!!!!!"+allProj[0]._id);
    var entry, findx, results = [];
    for (entry in dataset) {
    //console.log("dataNormal entry = "+JSON.stringify(entry));
      var newentry = {};
      for (findx in fieldnames) {
        newentry[ fieldnames[findx] ] = dataset[entry][ fieldnames[findx] ] || '';
      }
      results.push( newentry );
    }
    return results;
  };
});

tsmSlackApp.filter('approvalClass', function() {
 return function(field) {
    return ( field !== '' && field !== null  ) ? 'approved' : 'pending';
  };
});

tsmSlackApp.directive('wrapper', function() {
  return {
    restrict: 'E',
    replace: true,
    transclude: true,
    template: '<div ng-transclude class="container bottomcontainer" data-ng-class="{holdingblue:isholding, bulkholding:bulkholding}"></div>'
  };
});


tsmSlackApp.factory('adminLib', function($http) {
  return {
    trimArr: function(arr){ //console.log("trimArr: "+JSON.stringify(arr));
        var new_arr = [];
        for (str in arr) new_arr.push( arr[str].trim() );
        return new_arr;
    },
    //currently not used
    getArr: function(arr, field, val, line){ //return array.obj where arr.field matches val
      var i, result = null;
      arrloop: for(i in arr){ 
        var subObj = arr[i], fname = subObj[field];
        //console.log("%% getArr arr[i][field].length():"+fname.length+" val.length():"+val.length);
        if ( field in subObj && fname === val ){
          //console.log("%% getArr line:"+line+" arr[i][field] == val:"+(arr[i][field] == val)+" "+typeof arr[i][field]+" == "+typeof val);
          result = subObj;
          break arrloop;
      }}
      return result;
    },
    simplePut: function(path, payload, cb){
      $http.put( path, payload )
        .success( function (data, status, headers, config){
          cb('success', data);
        }).error( function(data, status, headers, config){
          cb('error', status);
        });
    },
    //the intention here is to create a UI for hte user to see this feedback
    pageMsg: function(status, response){
      console.log("pageMsg() has been called with a status of "+status+" from a response of "+JSON.stringify(response));
    },
    //meant to run at the top of each controller, fills facilityArr with all facilities
    //meant to set other user permissions in the future
    userSetUp: function(c){
      c.umeta = window.USERMETA;
      c.is_lab_admin = ( c.umeta.is_lab_admin === 'true' );
      //c.is_admin
      c.current_uid = c.umeta.id;
      c.current_name = c.umeta.name || c.umeta.email;
      c.current_role = c.umeta.capex_role;
      c.cur_market = c.RP.market || "Select Market";
      c.is_admin = ( ['corp', 'exec', 'cfo'].indexOf( c.umeta['capex_role'] ) >= 0 );
      c.userMarketList = [];
      c.multimarket = true;
      console.log("adminLib userSetUp c.umeta: "+JSON.stringify(c.umeta));
      $http.get( c.dataprefix+'/rest/admin/facility' ) //can always filter by local_radio
          .success(function(response) {
              c.facilityArr = []; //was marketArr
              c.radioList = [];
              c.facilityList = response.values; //was marketData
              for ( var indx in c.facilityList ) {
                c.facilityArr.push(c.facilityList[indx].Facility);
                if (c.facilityList[indx].Division === 'local_radio') { c.radioList.push(c.facilityList[indx]); }
              }
              if ( c.umeta.allmarkets === "true" || c.is_admin ) { //all markets
                  c.userMarketList = c.facilityArr; console.log("adminLib userSetUp allmarkets:true");
              } else if ( c.umeta.multimarkets && c.umeta.multimarkets.length > 1 ) { //some markets
                  c.userMarketList = c.umeta.multimarkets; console.log("adminLib userSetUp multimarkets:true");
              } else { c.multimarket = false; }
              //console.log("adminLib userSetUp c.userMarketList: "+JSON.stringify(c.userMarketList));
              return true;
      });
      return false;
    },
    //operation: 'copy', 'add', 'remove'
    //field: array containing  k:v objects
    //index: index of the requesting obj item
    //blank: blank set of data for add operation
    manageListData: function (operation, field, index, blank){
        var payload = {}, remove = (operation === 'remove') ? 1 : 0, newmodel = (operation === 'copy') ? field[index] : blank;
        for( k in newmodel ) {if (k.substring(0, 1) !== '$') payload[k] = newmodel[k];} //strip out ng $$hashKey
        if (operation === 'remove') { field.splice(index, remove); } else { field.splice(index, remove, payload); }
        //console.log("manageListData updated field "+JSON.stringify(field));        
    }
  };//return
});
