$(document).ready(function () {
    const vscode = acquireVsCodeApi();
        
    const requestUserData = () => {
        vscode.postMessage({ command: 'getAuthOrgs' });
    };

    requestUserData();

    let types = [];
    let orgs = [];
    let selectedTypes = [];
    let testClasses = '';
    
    let componentsMap = new Map();  
    let selectedComps = new Map();   

    window.addEventListener('message', (event) => {
        if(event.data.command === 'orgsList') {
            orgs = event.data.orgs; 
            $(".init").hide();
            loadSourceOrgs();
        } else if(event.data.command === 'types') {
            types = event.data.types;   
            $("#selection").show(); 
            refreshTypes(true);       
        } else if(event.data.command === 'components') {
            componentsMap.set(event.data.type, event.data.components);
            refreshComponents();
        } else if(event.data.command === 'deployStatus') {
            updateDeploymentStatus(event.data.result);
        } else if(event.data.command === 'compareResults') {
            console.log(event.data.files);
            event.data.files.forEach(file => {
               let filename = file.name;
               if(filename.indexOf("/") >= 0){
                    filename = filename.substring(0, filename.indexOf('/'));
               }
               if(selectedComps.has(filename)) {
                    if(selectedComps.get(filename).hasOwnProperty('source')) {
                        selectedComps.get(filename).source.push(file.source);
                    } else {
                        selectedComps.get(filename)['source'] = [file.source];
                    }
                    if(selectedComps.get(filename).hasOwnProperty('files')) {
                        selectedComps.get(filename).files.push(file.name);
                    } else {
                        selectedComps.get(filename)['files'] = [file.name];
                    }
                    if(file.dest !== '') {
                        if(selectedComps.get(filename).hasOwnProperty('dest')) {
                            selectedComps.get(filename).dest.push(file.dest);
                        } else {
                            selectedComps.get(filename)['dest'] = [file.dest];
                        }
                    }
               }
            });
            $('#previewtable').DataTable().clear().rows.add(Array.from(selectedComps.values())).draw(); 
            let column = $('#previewtable').DataTable().column(4); //Compare Results Column
            column.visible(true);
        } 
    });

    function loadSourceOrgs() {
        $('#source-org-field').empty();
        $('#source-org-field').append($("<option>").val('').text(''));
        orgs.forEach(org => {
            $('#source-org-field').append($("<option>").val(org.orgId).text(org.name));
        });
    } 

    $('#source-org-field').on("change", function(e){
        types = [];
        selectedTypes = [];
        componentsMap = new Map();
        selectedComps = new Map();
        $('.dd-options ui').empty();
        $('.dd-text-field').val('');
        $('.dd-select-all').prop('checked', false);
        $('.dd-text-field').attr("placeholder", 'No Types selected');      
        $('#datatable').DataTable().clear().rows.add([]).draw();
        $('#next').prop('disabled', true);
        $('#packagexml').prop('disabled', true);
        $('#errors').text('');
        $('.selected').text('Selected (0)');
        $('#selecteddatatable').DataTable().clear().draw(); 

        $("#selection").hide(); 
        if($('#source-org-field').val() !== '') {
            vscode.postMessage({ command: 'loadTypes', sourceOrgId: $(this).val()});
    
            $('#dest-org-field').empty();
            $('#dest-org-field').append($("<option>").val('').text(''));
            orgs.forEach(org => {
                if(org.orgId !== $('#source-org-field').val()) {
                    $('#dest-org-field').append($("<option>").val(org.orgId).text(org.name));
                }
            });
            $("#deploystatus").hide();
        }       
    });

    $("#tabs").tabs();
    $("#previewtabs").tabs();

    $('#datatable').DataTable({
        paging: false,
        /*searching: false,*/
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'asc']],
        columns: [
            { data: null, sortable: false },
            { data: 'type' },
            { data: 'name' },            
            { data: 'lastModifiedByName' },
            { data: 'lastModifiedDate', "type": "date", width:'200px' }
        ],
        columnDefs: [
            {
                orderable: false,
                render: function (data, type, row) {
                    if (selectedComps.has(row.type + "." + row.name)) {
                        return '<input type="checkbox" class="row-chk" value="' + row.type + "." + row.name + '" checked>';
                    } else {
                        return '<input type="checkbox" class="row-chk" value="' + row.type + "." + row.name + '">';
                    }
                },
                targets: 0
            }
        ],
        rowCallback: function(row, data, dataIndex){
            if (selectedComps.has(data.type + "." + data.name)) {
                $(row).css('background', 'lightgray');     
            } else {
                $(row).css('background', '');     
            }
        },
        language: {
            emptyTable: 'No components are matched to the selected criteria',
            info: "Total: _TOTAL_ component(s) available"
        }
    });

    $('#selecteddatatable').DataTable({
        paging: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'asc']],
        columns: [
            { data: 'type' },
            { data: 'name' },            
            { data: 'lastModifiedByName' },
            { data: 'lastModifiedDate', "type": "date", width:'200px' }
        ],
        language: {
            info: "Total: _TOTAL_ component(s)"
        }
    });

    $(".dd-text-field").on("click", function(e){
        e.stopPropagation();
		$(".dd-option-box").show();
        $(".dd-option-box").css({width: $(this).outerWidth()});
	});

    $(".dd-text-field").on("input", function(e){
		const txt = $(this).val().toLowerCase();
        types.forEach(function(type) {
            type.hidden = txt !== '' ? !type.name.toLowerCase().startsWith(txt) : false;           
        });
        refreshTypes(false);
    });

    $('.dd-option-box').on('click', function (e) {
        e.stopPropagation();
    });

    //'All' checkbox
    $(document).on('change', '.dd-select-all', function() {
        if ($(this).is(':checked')) {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if(!$(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', true).trigger('change');
                }                
            });                
        } else {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if($(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', false).trigger('change');
                }                
            });  
        }        
    });

    //Type checkbox
    $(document).on('change', '.dd-option-chk', function() {
        if ($(this).is(':checked')) {
            $(this).parent().parent().css("background",'LightGray');
            const selectedValue = $(this).val();
            selectedTypes.push(selectedValue);
            if(componentsMap.has(selectedValue)) {
                refreshComponents();
            } else {
                vscode.postMessage({ command: 'loadComponents', type:selectedValue, sourceOrgId: $('#source-org-field').val()});
            }            
        } else {
            $(this).parent().parent().css("background",'');
            const selectedValue = $(this).val();
            selectedTypes = $.grep(selectedTypes, function(type) {
                return type !== selectedValue;
            });
            refreshComponents();
        } 
        $('.dd-text-field').attr("placeholder", selectedTypes.length+ ' Type(s) selected');      
    });

    $('.dd-options ui').on('click', '.dd-option-fav', function (e) {
        let title = $(this).prop('title');
        let favs = [];
        types.forEach(function(type) {
            if(type.name === title) {
                type.isFavorite = !type.isFavorite;
            }  
            if(type.isFavorite) {
                favs.push(type.name);
            }          
        });
        refreshTypes(false);
        vscode.postMessage({ command: 'updateFavorites', data:favs});
        e.stopPropagation();  
    });

	$("body").on("click",function(e){
        $(".dd-option-box").hide();
	});

    $(document).keydown(function(e) {
        if (e.key === "Escape") {
           $(".dd-option-box").hide();
        }
    });
    $(document).mousedown(function(e) {
       if($(e.target)[0]?.classList[0]?.startsWith('dd-')) {
            return;
       } else {
            $(".dd-option-box").hide();
       }
    });

    $('.date-field').datepicker({
        dateFormat: 'mm/dd/yy',
        changeMonth: true,
        changeYear: true,
        showAnim: 'slideDown'
    });

    const today = new Date();
    const last30Days = new Date();
    last30Days.setDate(today.getDate() - 365);
    $('.date-field').datepicker("setDate", last30Days);

    $(".date-field").on("change", function(e){
        refreshComponents();
    });

    $(".state-field").on("change", function(e){
        refreshComponents();
    });

    function refreshTypes(init) {
        $('.dd-options ui').empty();
        types.sort(function (a, b) {
            if(a.isFavorite === b.isFavorite) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            } 
            return b.isFavorite - a.isFavorite;                 
        });
        types.forEach(function(type) {
            if(!type.hidden) {
                let fav = `<label class="dd-option-fav" title=${type.name}>☆</label>`;
                if(type.isFavorite) {
                    fav = `<label class="dd-option-fav" style="color:darkgoldenrod;" title=${type.name}>&#9733;</label>`;
                    if(init) {
                        selectedTypes.push(type.name);
                        vscode.postMessage({ command: 'loadComponents', type:type.name,  sourceOrgId: $('#source-org-field').val()});
                    }                    
                }
                $('.dd-options ui').append(`
                    <li class="dd-option" ${type.isFavorite ? "style='background:LightGray'" : ""}>
                        <div>
                            <input type="checkbox" value=${type.name} id=${type.name} class="dd-option-chk" 
                                    ${(init && type.isFavorite) || (selectedTypes.indexOf(type.name) >= 0) ? "checked" : ""}>
                            <label class="dd-option-lbl" for=${type.name}>${type.name}</label>
                        </div>
                        ${fav}
                    </li>
                `);
            }
        }); 
        $('.dd-text-field').attr("placeholder", selectedTypes.length+ ' Type(s) selected');
    }

    function refreshComponents() {
        const date = new Date( $(".date-field").val());
        let components = [];
        selectedTypes.forEach(function(type) {
            if(componentsMap.has(type)) {
                components = [...components, ...componentsMap.get(type)];
            }
        }); 
        components = components.filter(cmp => new Date(cmp.lastModifiedDate).getTime() >= date.getTime() && 
                cmp.manageableState === $(".state-field").val());
        $('#datatable').DataTable().clear().rows.add(components).draw();
        $('.available').text('Available ('+components.length+')');
        if($('.all-row-chk').is(':checked')) {
            $('.all-row-chk').prop('checked', false);
        }        
    }

    $(document).on('change', '.row-chk', function() {
        let val = $(this).val();
        if ($(this).is(':checked')) {
            selectedComps.set(val, $('#datatable').DataTable().row($(this).closest('tr')).data());  
            $(this).parent().parent().css('background', 'lightgray');       
        } else {
            selectedComps.delete(val);
            $(this).parent().parent().css('background', '');
            if($('.all-row-chk').is(':checked')) {
                $('.all-row-chk').prop('checked', false);
            }
        } 
        $('.selected').text('Selected ('+selectedComps.size+')');
        $('#selecteddatatable').DataTable().clear().rows.add(Array.from(selectedComps.values())).draw(); 
        if(selectedComps.size > 0) {
            $('#next').prop('disabled', false);
            $('#packagexml').prop('disabled', false);
        } else {
            $('#next').prop('disabled', true);
            $('#packagexml').prop('disabled', true);
        }
        $("#deploystatus").hide();
        $('.deployerrors').text('Deployment Errors (0)');
        $('#errortable').DataTable().clear().draw(); 
        $('.testfailures').text('Test Class Failures (0)');
        $('#testerrortable').DataTable().clear().draw(); 
    });

    $('.all-row-chk').on('change', function() {
        let val = $(this).val();
        if ($(this).is(':checked')) {
            $('.row-chk').each(function(indx, chxbox) {
                if(!$(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', true).trigger('change');
                }                
            });        
        } else {
            $('.row-chk').each(function(indx, chxbox) {
                if($(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', false).trigger('change');
                }                
            }); 
        }       
    });

    $('#previewtable').DataTable({
        paging: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[1, 'asc']],
        columns: [
            { data: 'type' },
            { data: 'name' },            
            { data: 'lastModifiedByName' },
            { data: 'lastModifiedDate', "type": "date", width:'200px' },
            { data: 'source' }
        ],
        language: {
            info: "Total: _TOTAL_ component(s)"
        },
        columnDefs: [
            {
                orderable: false,
                render: function (data, type, row) {
                    if (row.dest) {
                        return '<a href="#" class="fileview" data-name="'+row.type+"."+row.name+'">View</a>';
                    } else {
                        return 'N/A';
                    }
                },
                targets: 4
            }
        ],
    });

    $('#next').on('click', function (e) {        
        if(orgs.length === 1) {
            $("#errors").text('There are no destination orgs available to deploy.');    
        } else {
            $("#selection").hide();
            $("#source-org").hide();
            $("#preview").show();
            $('.preview').text('Selected ('+selectedComps.size+')');            
            $('#previewtable').DataTable().clear().rows.add(Array.from(selectedComps.values())).draw(); 
            let column = $('#previewtable').DataTable().column(4); //Compare Results Column
            column.visible(false);
            if($('#dest-org-field').val() === '') {
                $('#deploy-buttons').hide();        
            }
        }
    });

    $('#packagexml').on('click', function (e) {
        let packagexml = getPackageXml();
        navigator.clipboard.writeText( `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${packagexml}\t<version>62.0</version>\n</Package>`);
        vscode.postMessage({ command: 'toastMessage', message: 'Package.xml copied to clipboard'});
    });

    $('#previous').on('click', function (e) {
        $("#selection").show();
        $("#source-org").show();
        $("#preview").hide();
    });

    $('#dest-org-field').on("change", function(e){
        $("#deploystatus").hide(); 
        $('.deployerrors').text('Deployment Errors (0)');
        $('#errortable').DataTable().clear().draw(); 
        $('.testfailures').text('Test Class Failures (0)');
        $('#testerrortable').DataTable().clear().draw(); 
        if($('#dest-org-field').val() === '') {
            $('#deploy-buttons').hide();        
        } else {
            $('#deploy-buttons').show();
        }
    });

    $('#test-classes-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: false});
    
    $(".testoption-field").on("change", function(e){
        if($(this).val() === 'RunSpecifiedTests') {
            $('#test-classes-dialog').dialog("open"); 
            $('#view-classes').show(); 
            if(testClasses === '') {
                $('#deploy').prop('disabled', true);
                $('#validate').prop('disabled', true);
            }
        } else {
            $('#view-classes').hide();  
            $('#deploy').prop('disabled', false);
            $('#validate').prop('disabled', false);
        }
    });

    $('#view-classes').on('click', function (e) {
        $("#test-classes-dialog").dialog("open");
    });

    $('#save-classes').on('click', function (e) {
        if($('#test-classes').val().trim() !== '') {
            testClasses = $('#test-classes').val().trim();
            $('#deploy').prop('disabled', false);
            $('#validate').prop('disabled', false);
            $('#test-classes').css('border' ,'');
            $('#test-classes-dialog').dialog("close");
        } else {
            $('#test-classes').css('border' ,'1px solid #f00');
        }        
    });

    $('#deploy').on('click', function (e) {
        validateOrDeploy(false);
    });

    $('#validate').on('click', function (e) {
        validateOrDeploy(true);
    });

    function validateOrDeploy(checkOnly) {
        let packagexml = getPackageXml();

        let runTests = '';
        if($(".testoption-field").val() === 'RunSpecifiedTests') {
            testClasses.split(',').forEach(cls => {
                runTests += '<met:runTests>'+cls+'</met:runTests>';
            });
        }

        vscode.postMessage({ command: 'deploy', packagexml:packagexml, sourceOrgId: $('#source-org-field').val(), destOrgId: $("#dest-org-field").val(), 
            checkOnly: checkOnly, testLevel: $(".testoption-field").val(), testClasses: runTests});
        $("#deploystatus").show();
        $("#deploy-buttons").hide();
        $("#dest-org-field").prop('disabled', true);
        $("#previous").prop('disabled', true);

        $('.path-list').empty();
        $('.path-list').append('<li class="path path-notstarted retrieve"><p>Retrieve</p><p style="width:0px;"><span/></p></li>');
        $('.path-list').append('<li class="path path-notstarted deployment"><p>'+(checkOnly ? 'Validation' : 'Deployment')+'</p><p style="width:0px;"><span/></p></li>');
        $('.path-list').append('<li class="path path-notstarted testclasses"><p>Test Classes</p><p style="width:0px;"><span/></p></li>');  
        $("#progressbar").show();
    }

    function getPackageXml() {
        var comps = new Map();
        Array.from(selectedComps.values()).forEach(comp => {
            if(comps.has(comp.type)) {
                comps.get(comp.type).push(comp.name);
            } else {
                comps.set(comp.type, [comp.name]);
            }
        });
        let packagexml = '';
        Array.from(comps.keys()).forEach(type => {
            packagexml += '\t<types>\n';
            comps.get(type).forEach(e => {
                packagexml += '\t\t<members>'+e+'</members>\n';
            });
            packagexml += '\t\t<name>'+type+'</name>\n';
            packagexml += '\t</types>\n';
        });
        return packagexml;
    }

    $("#progressbar").progressbar({"value": 0}); 

    function updateDeploymentStatus(result) {
        $('.deployerrors').text('Deployment Errors (0)');
        $('#errortable').DataTable().clear().draw(); 
        $('.testfailures').text('Test Class Failures (0)');
        $('#testerrortable').DataTable().clear().draw(); 
        $(".coverage-error").hide();
        $("#quick-deploy").hide();
        $("#cancel-deploy").show();

        if(result.stage === "deploymentStatus") {
            console.log(result);
            let total = Number(result.numberComponentsTotal);
            let completed = Number(result.numberComponentsDeployed);
            let errors = Number(result.numberComponentErrors);
            $("#progressbar").progressbar({"value": (completed + errors) / total*100});  
            
            let progressLabel = (result.checkOnly === 'true' ? "Validation" : "Deployment") + " "+ result.status;
            progressLabel += " ("+ (completed + errors) + "/" + total + ")";
            if(errors > 0) {
                progressLabel += " - "+errors+" Errors";
            }

            $($(".deployment")[0].childNodes[0]).text(progressLabel);

            if(result.done === 'true') {
                $("#progressbar").hide();
                $("#deploy-buttons").show();
                $("#dest-org-field").prop('disabled', false);
                $("#previous").prop('disabled', false);
                $("#cancel-deploy").hide();
                if(result.checkOnly === 'true' && result.status === 'Succeeded' && result.runTestsEnabled === 'true') {
                    quickdeployId = result.id;
                    $("#quick-deploy").show();
                }  
                $(".deployment").removeClass("path-running");
                /*if(result.status === "SucceededPartial") {
                    $(".deployment").removeClass("path-running").addClass("path-partial");
                }  else if(result.status === "Failed") {
                    $(".deployment").removeClass("path-running").addClass("path-failed");
                }*/ 
                if(result.details?.componentFailures?.length > 0) {
                    $('.deployerrors').text('Deployment Errors ('+result.details.componentFailures.length+')');
                    $('#errortable').DataTable().clear().rows.add(result.details.componentFailures).draw(); 
                } 
                if(result.details?.runTestResult?.numFailures > 0) {
                    $('.testfailures').text('Test Class Failures ('+result.details.runTestResult.numFailures+')');
                    $('#testerrortable').DataTable().clear().rows.add(result.details.runTestResult.failures).draw(); 
                }    
                if(result.details?.runTestResult?.codeCoverageWarnings && result.status !== "Canceled ") {
                    $(".coverage-error").show();
                    $(".coverage-error-label").text(result.details.runTestResult.codeCoverageWarnings.message);
                }         
            } else {
                if(result.status === "Canceling") {
                    $("#cancel-deploy").hide();
                    $("#progressbar").hide(); 
                }
            }

            if(result.numberTestsTotal > 0) {
                let totaltcs = Number(result.numberTestsTotal);
                let completedtcs = Number(result.numberTestsCompleted);
                let errorstcs = Number(result.numberTestErrors);                    
                let processtcs = completedtcs + errorstcs;
                $("#progressbar").progressbar({"value": (processtcs) / totaltcs*100});  
                if(processtcs === totaltcs) {
                    $($(".testclasses")[0].childNodes[0]).text("Completed Tests ("+processtcs+ "/" + totaltcs + ")"+(errorstcs > 0 ? " - "+errorstcs+" Failures" : ""));
                    $(".testclasses").removeClass("path-running");
                    /*if(errorstcs > 0) {
                        $(".testclasses").addClass("path-failed");
                    }*/
                } else {
                    $($(".testclasses")[0].childNodes[0]).text("Running Tests ("+processtcs+ "/" + totaltcs + ")"+(errorstcs > 0 ? " - "+errorstcs+" Failures" : ""));
                    $(".testclasses").removeClass("path-notstarted").addClass("path-running");
                }

                if(result.status === "Canceled") {
                    $(".testclasses").removeClass("path-running");
                    $($(".testclasses")[0].childNodes[0]).text("Canceled Tests");
                } else if (result.status === "Canceling") {
                    $($(".testclasses")[0].childNodes[0]).text("Cancelling Tests");
                }
            }
        } else {                      
            if(result.stage === "retrieve") {
                $(".retrieve").removeClass("path-notstarted").addClass("path-running");
                $($(".retrieve")[0].childNodes[0]).text('Retrieve InProgress');               
                $("#progressbar").progressbar({"value": 30});  
            } else if(result.stage === "retrieveCompleted") {
                $(".retrieve").removeClass("path-running");
                $($(".retrieve")[0].childNodes[0]).text('Retrieve Completed');
                $("#progressbar").progressbar({"value": 100});  
            } else if(result.stage === "deployment") {
                $(".deployment").removeClass("path-notstarted").addClass("path-running");
                $("#progressbar").progressbar({"value": 0});  
            }
        } 
    }   

    $('#errortable').DataTable({
        paging: false,
        scrollY: '200px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[0, 'asc']],
        columns: [
            { data: 'fullName', width:'300px' },
            { data: 'componentType' },            
            { data: 'lineNumber' },
            { data: 'columnNumber'},
            { data: 'problem'}
        ],
        language: {
            info: "Total: _TOTAL_ error(s)"
        }
    });   
    
    $('#testerrortable').DataTable({
        paging: false,
        scrollY: '200px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[0, 'asc']],
        columns: [
            { data: 'name', width:'300px' },
            { data: 'methodName' },            
            { data: 'message' }
        ],
        language: {
            info: "Total: _TOTAL_ failure(s)"
        },
        columnDefs: [
            {
                render: function (data, type, row) {
                    return row.message +'<br> Stack Trace: '+ row.stackTrace;
                },
                targets: 2
            }
        ]
    });  
    
    let quickdeployId = '';
    $("#quick-deploy").on('click', function (e) {
        vscode.postMessage({ command: 'quickDeploy', id: quickdeployId, destOrgId: $("#dest-org-field").val()});
        $("#deploy-buttons").hide();
    });

    $("#cancel-deploy").on('click', function (e) {
        vscode.postMessage({ command: 'cancelDeploy'});        
    });

    $(".tab-link").on('click', function (e) {
        $('.tab-content').hide();
        $('.tab-link').removeClass('active');
        $('#'+e.currentTarget.name).show();
        $(e).addClass('active');
    });

    $(".tab").on('click', function (e) {
        $('#'+e.currentTarget.attributes.name.value).DataTable().draw(); 
    });

    $("#compare").on('click', function (e) {
        let packagexml = getPackageXml();
        vscode.postMessage({ command: 'compare', sourceOrgId: $('#source-org-field').val(), 
            packagexml:packagexml, destOrgId: $("#dest-org-field").val()});  
    });

    $("#previewtable").on('click', 'a.fileview', function (e) {
        let filename = e.currentTarget.dataset.name;
        let source = selectedComps.get(filename).source;
        let dest = selectedComps.get(filename).dest;
        let files = selectedComps.get(filename).files;
        source.forEach((element, index) => {
            vscode.postMessage({ command: 'filePreview', source: element,  dest: dest[index], file: files[index]}); 
        });        
        
    });
});

