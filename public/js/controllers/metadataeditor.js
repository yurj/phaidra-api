var app = angular.module('metadataeditorApp', ['ui.bootstrap', 'ajoslin.promise-tracker', 'metadataService', 'directoryService']);

app.controller('MetadataeditorCtrl', function($scope, MetadataService, DirectoryService, promiseTracker) {
    
	$scope.regex_pid = /^[a-zA-Z\-]+:[0-9]+$/;
	// use: <input ng-pattern="regex_identifier" ...
	
	// we will use this to track running ajax requests to show spinner
	$scope.loadingTracker = promiseTracker.register('loadingTracker');
	
	$scope.default_helptext = 'Loading tooltip content...';
	
	// used to disable the form and it's controls on save
	$scope.form_disabled = false;
	
    $scope.fields = [];
    $scope.languages = [];
    $scope.metadata_format_version = "";
    $scope.pid = '';
    $scope.alerts = [];    

    $scope.closeAlert = function(index) {
    	$scope.alerts.splice(index, 1);
    };
    
    $scope.getMetadataFormatVersion = function() {
        return $scope.metadata_format_version;
    };
    	
    $scope.getFieldsCount = function() {
        return $scope.fields.length;
    };
    
    $scope.init = function () {
    	
   
    	
    };
        
    $scope.save = function() {
    	var metadata_format_version = 1;
    	$scope.form_disabled = true;
    	var promise = MetadataService.saveToObject(metadata_format_version, $scope.pid, $scope.fields)
    	$scope.loadingTracker.addPromise(promise);
    	promise.then(
        	function(response) { 
        		$scope.alerts = response.data.alerts;
        		$scope.languages = [];
        		$scope.fields = [];    			
        		$scope.metadata_format_version = '';
        		$scope.form_disabled = false;
        	}
        	,function(response) {
           		$scope.alerts = response.data.alerts;
           		$scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
           		$scope.form_disabled = false;
           	}
        );
    	        
    };
    
    $scope.resetEditor = function() {
    	$scope.alerts = [];
		$scope.languages = [];
		$scope.fields = [];    			
		$scope.metadata_format_version = '';
    };
    
    $scope.getMetadataTree = function(){
    	var metadata_format_version = 1;
    	$scope.resetEditor();
        var promise = MetadataService.getMetadataTree(metadata_format_version, pid);        
        $scope.loadingTracker.addPromise(promise);
        promise.then(
    		function(response) { 
    			$scope.alerts = response.data.alerts;
    			$scope.languages = response.data.languages;
    			$scope.fields = response.data.tree;    			
    			$scope.metadata_format_version = metadata_format_version;
    		}
    		,function(response) {
           		$scope.alerts = response.data.alerts;
           		$scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
           	}
    	);
    };
    
    // used to filter array of elements: if 'hidden' is set, the field will not be included in the array
    $scope.filterHidden = function(e)
    {
        return !e.hidden;        
    };
    
    $scope.loadObject = function(pid){
    	var metadata_format_version = 1;
    	$scope.resetEditor();
    	var promise = MetadataService.getObjectMetadata(metadata_format_version, pid);
    	$scope.loadingTracker.addPromise(promise);
    	promise.then(
    		function(response) { 
    			$scope.alerts = response.data.alerts;
    			$scope.languages = response.data.languages;
    			$scope.fields = response.data.metadata;
    		}
    		,function(response) {
           		$scope.alerts = response.data.alerts;
           		$scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
           	}
    	);    	
    };
    
    $scope.canDelete = function(child){
    	var a = $scope.getContainingArray(this);  
    	var cnt = 0;
    	for (i = 0; i < a.length; ++i) {
    		if(a[i].xmlns == child.xmlns && a[i].xmlname == child.xmlname){
    			cnt++;
    		}
    	}
    	return cnt > 1;
    }
    
    $scope.addNewElement = function(child){    	    	
    	// array of elements to which we are going to insert
    	var arr = $scope.getContainingArray(this);    	
    	// copy the element
    	var tobesistr = angular.copy(child);    	
    	// get index of the current element in this array
    	var idx = angular.element.inArray(child, arr); // we loaded jQuery before angular so angular.element should equal jQuery
    	// increment order of the new element (we are appending to the current one)
    	// and also all the next elements
    	// but only if the elements are actually ordered
    	if(child.ordered){
    		tobesistr.data_order++;
    		var i;
        	for (i = idx+1; i < arr.length; ++i) {
        		// update only elements of the same type
        		if(arr[i].xmlns == child.xmlns && arr[i].xmlname == child.xmlname){
        			arr[i].data_order++;
        		}
        	}
    	}    	
    	// insert into array at specified index, angular will sort the rest out
    	arr.splice(idx+1, 0, tobesistr);    
    }
    
    $scope.deleteElement = function(child){    	
    	// array of elements where we are going to delete
    	var arr = $scope.getContainingArray(this);	    	    	
    	// get index of the current element in this array
    	var idx = angular.element.inArray(child, arr); // we loaded jQuery before angular so angular.element should equal jQuery
    	// decrement data_order of remaining elements
    	if(child.ordered){
	    	var i;
	    	for (i = idx+1; i < arr.length; ++i) {
	    		// update only elements of the same type
        		if(arr[i].xmlns == child.xmlns && arr[i].xmlname == child.xmlname){
        			arr[i].data_order--;
        		}
	    	}
    	}
    	// delete
    	arr.splice(idx, 1);    
    }
    
    // black magic here...
    $scope.getContainingArray = function(scope){
    	// this works for normal fields
    	var arr = scope.$parent.$parent.$parent.field.children;    	
    	// this for blocks
    	if(scope.$parent.$parent.$parent.$parent.$parent.child){
    		if(scope.$parent.$parent.$parent.$parent.$parent.child.children){
    			arr = scope.$parent.$parent.$parent.$parent.$parent.child.children;
    		}
    	}    	
    	// and this for fields in blocks
    	if(scope.$parent.$parent.$parent.$parent.$parent.$parent.child){
    		if(scope.$parent.$parent.$parent.$parent.$parent.$parent.child.children){
    			arr = scope.$parent.$parent.$parent.$parent.$parent.$parent.child.children;
    		}
    	}
    	return arr;
    }
    
    Array.prototype.move = function(from, to) {
        this.splice(to, 0, this.splice(from, 1)[0]);
    };
    
    $scope.upElement = function(child){
    	// array of elements which we are going to rearrange
    	var arr = $scope.getContainingArray(this);
    	// get index of the current element in this array
    	var idx = angular.element.inArray(child, arr);
    	
    	// update the data_order property
    	if(child.ordered){
	    	child.data_order--;
	    	// only if it's the same type (should be always true
	    	// because we are checking this in canUpElement)
    		if(arr[idx-1].xmlns == child.xmlns && arr[idx-1].xmlname == child.xmlname){
    			arr[idx-1].data_order++;
    		}
    	}
    	
    	// move to index--
    	if(idx > 0){
    		arr.move(idx, idx-1);
    	}    	
    }

    $scope.downElement = function(child){
    	// array of elements which we are going to rearrange
    	var arr = $scope.getContainingArray(this);
    	// get index of the current element in this array
    	var idx = angular.element.inArray(child, arr);
    	
    	// update the data_order property
    	if(child.ordered){
	    	child.data_order++;
	    	// only if it's the same type (should be always true
	    	// because we are checking this in canDownElement)
    		if(arr[idx+1].xmlns == child.xmlns && arr[idx+1].xmlname == child.xmlname){
    			arr[idx+1].data_order--;
    		}
    	}
    	
    	// move to index++
    	arr.move(idx, idx+1);    	
    }
    
    $scope.canUpElement = function(child){
    	return child.ordered && (child.data_order > 0);
    }

    $scope.canDownElement = function(child){
    	
    	if(!child.ordered){ return false; }
    	
    	// this array can contain also another type of elements
    	// but we only order the same type, so find if there is
    	// an element of the same type with higher data_ordered
    	var arr = $scope.getContainingArray(this);
    	
	    var i;
	    for (i = 0; i < arr.length; ++i) {
	        if(arr[i].data_order > child.data_order){
	        	return true;
	        }
	    }
    	
	    return false;

    }
    
    // just for debug
    $scope.getIndex = function(child){
    	// array of elements which we are going to rearrange
    	var arr = $scope.getContainingArray(this);
    	// get index of the current element in this array
    	return angular.element.inArray(child, arr);
    }
    
});

app.directive('multilevelSelect', function($http, DirectoryService) {
	
    function link(scope, element, attrs) {
    	scope.levelsObject = [ { value : '-1', options: [], label: '' } ];
    	scope.alerts = [];
    	
    	// we can fill the first level on linking, it won't change
    	var promise = DirectoryService.getStudyPlans();
    	//scope.loadingTracker.addPromise(promise);
    	promise.then(
    		function(response) { 
    			scope.alerts = response.data.alerts;
    			scope.levelsObject[0].options = response.data.study_plans;
    		}
    		,function(response) {
           		scope.alerts = response.data.alerts;
           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
           	}
    	);
    	
    	// if there is a change in metadata tree, apply it on select boxes
    	scope.$watch('rootChild', function(root) {        	  
    		if(root){
    			
    			// get values from children
    			var i;
    			var ids = [];
    			var promises = [];
    			for (i = 0; i < root.children.length; ++i) {
    				// first level is spl, the rest is kennzahl
    				if(root.children[i].xmlname == 'spl'){    
    					// spl is on index 0    					
    					scope.levelsObject[0].value = root.children[i].ui_value; 
    					scope.levelsObject[0].label = root.children[i].labels.en;
    					// for spl we don't need to reload options
    				}else{ 					
    					// kennzahl elements are ordered, we will order them in model object as well
    					// +1 because 0 is spl
    					var idx = parseInt(root.children[i].data_order)+1; 
    					if(!scope.levelsObject[idx]){
    						scope.levelsObject[idx] = { value : '-1', options: [], label: '' };					
    					}
    					scope.levelsObject[idx].value = root.children[i].ui_value;
    					scope.levelsObject[idx].label = root.children[i].labels.en;
    					
    					// reload values, splid: is the value of the first level
    					var splid = root.children[0].ui_value;
    					ids.push(root.children[i].ui_value);

    					// before this async call is called the ids will be overwritten
    					// so we have to copy them
    					var local_ids_copy = [];    					
    					angular.copy(ids, local_ids_copy);
    					DirectoryService.getStudy(splid, local_ids_copy, idx).then(
    	    	    		function(response) { 
    	    	    			scope.alerts = response.data.alerts;    	    	    	
    	    	    			angular.copy(response.data.study, scope.levelsObject[response.data.level].options);
    	    	    		}
    	    	    		,function(response) {
    	    	           		scope.alerts = response.data.alerts;
    	    	           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
    	    	           	}
    	    	    	);
    	    	    	
    				}
    			}    			
		        	           
      	  	}
        }, true);

    	// if there is a change in select boxes model, apply it on metadata tree
        scope.$watch('levelsObject', function(value) { 

        	if(value){
        		var ids = [];
        		var promises = [];
        		var change = false;
        		var delete_from_index = scope.levelsObject.length;
        		for (i = 0; i < scope.levelsObject.length; ++i) {
        			if(!change){    	
    
       					if(scope.rootChild.children[i].ui_value != scope.levelsObject[i].value){    
       						scope.rootChild.children[i].ui_value = scope.levelsObject[i].value;
       						change = true;
       					}
       					if(i != 0){       						
       						ids.push(scope.levelsObject[i].value);
       					}
           				    					
        			}else{
        				// there was a change in the previous level, we need to re-fill options of this level
        				// and remove all subsequent levels
        				delete_from_index = i;
        				// reload values, id: is the value of the previous level
    					var splid = scope.rootChild.children[0].ui_value;    					
    					ids.push(scope.levelsObject[i].value);
    					   	    			
    					var local_ids_copy = [];
    					angular.copy(ids, local_ids_copy);    					
   			         	DirectoryService.getStudy(splid, local_ids_copy, i).then(
    	    	    		function(response) { 
    	    	    			scope.alerts = response.data.alerts;
    	    	    			angular.copy(response.data.study, scope.levelsObject[response.data.level].options);
    	    	    		}
    	    	    		,function(response) {
    	    	           		scope.alerts = response.data.alerts;
    	    	           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
    	    	           	}
    	    	    	);
        				break;
        			}        			
        		}        		
        		scope.levelsObject.splice(delete_from_index, scope.levelsObject.length-delete_from_index);
        		scope.rootChild.children.splice(delete_from_index, scope.rootChild.children.length-delete_from_index);
        		
      	  	}
        	
        }, true);
        
      }
   
      return {
        restrict: 'E',
        link: link,
        replace: true,
        templateUrl: '/views/directives/multilevel_select.html',
        scope: {
        	rootChild: '=rootChild'
          },
      };
});


app.directive('phaidraOrgassignment', function(DirectoryService) {
	
    function link(scope, element, attrs) {
    	scope.orgassignmentObject = { faculty: '', department: ''};
    	scope.faculties = [];
    	scope.faculty_label = '';
    	scope.department_label = '';
    	
    	// we can fill faculties on linking, they won't change
    	var promise = DirectoryService.getOrgUnits(null);
    	//scope.loadingTracker.addPromise(promise);
    	promise.then(
    		function(response) { 
    			scope.alerts = response.data.alerts;
    			scope.faculties = response.data.org_units;
    		}
    		,function(response) {
           		scope.alerts = response.data.alerts;
           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
           	}
    	);
    	
    	// if there is a change in metadatatree, apply it on select boxes
    	scope.$watch('orgassignmentChild', function(child) {        	  
    		if(child){
    			
    			// get faculty_id from child
    			var i;
    			var faculty_id;
    			var department_id;
    			for (i = 0; i < child.children.length; ++i) {
    				if(child.children[i].xmlname == 'faculty'){    					
    					faculty_id = child.children[i].ui_value; 
    					scope.faculty_label = child.children[i].labels.en;    	    	    
    				}
    				if(child.children[i].xmlname == 'department'){    					
    					department_id = child.children[i].ui_value; 
    					scope.department_label = child.children[i].labels.en;
    				}
    			}
    			
    			// fill departments in orgassignmentObject
    			scope.departments = [];
    			var promise = DirectoryService.getOrgUnits(faculty_id);
    	    	//scope.loadingTracker.addPromise(promise);
    	    	promise.then(
    	    		function(response) { 
    	    			scope.alerts = response.data.alerts;
    	    			scope.departments = response.data.org_units;
    	    		}
    	    		,function(response) {
    	           		scope.alerts = response.data.alerts;
    	           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
    	           	}
    	    	);
    	    	
    	    	scope.orgassignmentObject.faculty = faculty_id;
    	    	scope.orgassignmentObject.department = department_id;
		        	           
      	  	}
        }, true);
   
    	// if there is a change in faculty selectbox, apply it on metadata tree 
    	// and re-fill departments selectbox if faculty has changed
        scope.$watch('orgassignmentObject', function(value) { 

        	if(value){        		
        		var faculty_change = false;
        		for (i = 0; i < scope.orgassignmentChild.children.length; ++i) {
        			if(scope.orgassignmentChild.children[i].xmlname == 'faculty'){    	
        				if(scope.orgassignmentChild.children[i].ui_value != scope.orgassignmentObject.faculty){
        					faculty_change = true;
        				}
        				scope.orgassignmentChild.children[i].ui_value = scope.orgassignmentObject.faculty;    					
        			}
        			if(scope.orgassignmentChild.children[i].xmlname == 'department'){    					
        				scope.orgassignmentChild.children[i].ui_value = scope.orgassignmentObject.department;    					
        			}
        		}
        		
        		// fill departments in orgassignmentObject
        		if(faculty_change){
	    			scope.departments = [];
	    			var promise = DirectoryService.getOrgUnits(faculty_id);
	    	    	//scope.loadingTracker.addPromise(promise);
	    	    	promise.then(
	    	    		function(response) { 
	    	    			scope.alerts = response.data.alerts;
	    	    			scope.departments = response.data.org_units;
	    	    		}
	    	    		,function(response) {
	    	           		scope.alerts = response.data.alerts;
	    	           		scope.alerts.unshift({type: 'danger', msg: "Error code "+response.status});
	    	           	}
	    	    	);
        		}
      	  	}
        	
        }, true);
        
      }
   
      return {
        restrict: 'E',
        link: link,
        replace: true,
        templateUrl: '/views/directives/orgassignment.html',
        scope: {
        	orgassignmentChild: '=orgassignmentChild'
          },
      };
});

app.directive('phaidraDuration', function() {
      
      function link(scope, element, attrs) {
    	  scope.durationObject = {  hours: '', minutes: '', seconds: ''};
    	  scope.regex_duration = /^[0-9][0-9]*$/;
    
          scope.$watch('duration', function(value) {        	  
        	  if(value){
	        	// format: PT99H12M13S
        		var regex = /^PT([0-9][0-9]*)H/g;
        		var match = regex.exec(value.ui_value);
	            var hours = match ? match[1] : '';
	            
	            regex = /H([0-9][0-9]*)M/g;
        		match = regex.exec(value.ui_value);
	            var minutes = match ? match[1] : '';
	            
	            regex = /M([0-9][0-9]*)S$/g;
        		match = regex.exec(value.ui_value);
	            var seconds = match ? match[1] : '';
	           
		        scope.durationObject.hours = hours ? hours : '';
		        scope.durationObject.minutes = minutes ? minutes : '';
		        scope.durationObject.seconds = seconds ? seconds : '';
	           
        	  }
          }, true);
     
          scope.$watch('durationObject', function(value) { 
        	  //alert(scope.durationObject.hours+':'+scope.durationObject.minutes+':'+scope.durationObject.seconds);
        	  if(value && (scope.durationObject.hours || scope.durationObject.minutes || scope.durationObject.seconds)){
        		  scope.duration.ui_value = 'PT' + (scope.durationObject.hours ? scope.durationObject.hours : '') + 'H' + (scope.durationObject.minutes ? scope.durationObject.minutes : '') + 'M' + (scope.durationObject.seconds ? scope.durationObject.seconds : '') + 'S';
        		  scope.duration.value = 'PT' + (scope.durationObject.hours ? scope.durationObject.hours : '00') + 'H' + (scope.durationObject.minutes ? scope.durationObject.minutes : '00') + 'M' + (scope.durationObject.seconds ? scope.durationObject.seconds : '00') + 'S';
        	  }else{
        		  scope.duration.ui_value = '';
        		  scope.duration.value = '';
        	  }
          }, true);
          
        }
     
        return {
          restrict: 'E',
          link: link,
          replace: true,
          templateUrl: '/views/directives/duration.html',
          scope: {
        	  duration: '=duration'
            },
        };
});

// lazy binding
(function($){
    $.fn.lazybind = function(event, fn, timeout, abort){
        var timer = null;
        $(this).bind(event, function(e){
            var ev = e;
            timer = setTimeout(function(){
                fn(ev);
            }, timeout);
        });
        if(abort == undefined){
            return;
        }
        $(this).bind(abort, function(){
            if(timer != null){
                clearTimeout(timer);
            }
        });
    };
})(jQuery);

// load tooltip content on demand
app.directive('phaidraHelp', function($http, $timeout) {
	 return {
	  restrict: 'A', 

	  link: function(scope, element, attr) {
	  
	      // the tooltip is shown after some delay
	      // and we also don't want to load the content
		  // when user just crossed the field with a mouse
		  // so we are going to load it on mouseover, but only
		  // if user stays hier a while (see, if mouseout before, it will be cancelled)
		  // BUT, we want the content to be loaded before the tooltip shows
		  // otherwise it will be wrong positioned because of the changed content
		  // (and correctly positioned only on second hover)
		  // + we need to call $scope.$apply
		  element.lazybind('mouseover',function(e) {
			 
			  // this will make the tooltip realize it has a new content
			  // so if the new content is already there, it will be correctly positioned
			  scope.$apply(function(e) {
				  
				  if(attr['loaded']){
					  return;			  
				  }
				 
		          var promise = $http({
			          method  : 'GET',
			          url     : '/help/tooltip',
			          params  : { id: attr['phaidraHelpId']  }
			      });        
			      scope.loadingTracker.addPromise(promise);
			      promise.then(
			  		function(response) { 	  		
			  			
			  			attr.$set('tooltipHtmlUnsafe', response.data.content);
			  			attr.$set('loaded', true);
			  			
			   		}
			   		,function(response) {
			   			attr.$set('tooltipHtmlUnsafe', "Failed to load tooltip");
			       	}
			   	  );
		      
			  });
		  }, 1000, 'mouseout' );
	   }
	 }
});


