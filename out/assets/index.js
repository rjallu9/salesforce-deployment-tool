$(document).ready(function () {
    const vscode = acquireVsCodeApi();
        
    const loadOrgs = () => {
        vscode.postMessage({ command: 'getAuthOrgs', refresh:false });
    };

    loadOrgs();

    $("#tabs").tabs();
    $("#tabs").hide();
    $('#dest-org-section').hide(); 

    let orgs = [];    
    let types = [];    
    let selectedTypes = new Set();
    
    let componentsMap = new Map();  
    let selectedComps = new Map();    
    let stdFieldsMap = new Map(); 

    window.addEventListener('message', (event) => {
        if(event.data.command === 'orgsList') {
            orgs = event.data.orgs;
            $("#source-org").show();
            $("#source-org-refresh").show();
            $("#spinner").hide();
            loadSourceOrgs();
        } else if(event.data.command === 'loading') {
            $(".spinnerlabel").text(event.data.message);       
        } else if(event.data.command === 'error') {
            $("#errors").text(event.data.message);   
            $("#spinner").hide();
        } else if(event.data.command === 'previewerror') {
            $("#errors").text(event.data.message);  
            $("#deploystatus").hide(); 
            $("#progressbar").hide();
            $("#deploy-buttons").show();
            $("#dest-org-field").prop('disabled', false);
            $("#cancel-deploy").hide(); 
            $("#spinner").hide();
        } else if(event.data.command === 'components') {
            componentsMap.set(event.data.type, event.data.components);                         
        } else if(event.data.command === 'stdFields') { 
            stdFieldsMap.set(event.data.name, event.data.fields);
        } else if(event.data.command === 'typesComponents') {
            if(stdFieldsMap.size > 0) {
                componentsMap.keys().forEach(function(type) {
                    if(type === 'CustomField') {
                        const stdFields = Array.from(stdFieldsMap.values()).flat();
                        stdFields.forEach((name) => {
                            componentsMap.get(type).push({ name, type:'CustomField', lastModifiedByName:'', lastModifiedDate:'', parent: 'CustomObject' });
                        });
                    }             
                });
            }  
            componentsMap.keys().forEach((name) => {
                types.push({name, hidden: false, count: componentsMap.get(name).length});
                selectedTypes.add(name);
            });
            types.sort((a, b) => a.name.localeCompare(b.name));
            refreshTypes();    
            $("#spinner").hide();    
            $("#compTypes").show();
            $('#tabs').show();    
            $("#refresh-lbl").show(); 
            $("#refreshlabel").text('Last Refresh Date: '+event.data.timestamp);   
            refreshComponents();
        } else if(event.data.command === 'deployStatus') {
            updateDeploymentStatus(event.data.result);
        } else if(event.data.command === 'compareResults') {
            $("#spinner").hide();
            console.log(event.data.files);
            loadCompareResults(event.data.files);
        } else if(event.data.command === 'hidespinner') {
            $("#spinner").hide();
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
        resetComponents();  
        $("#compTypes").hide();
        $("#errors").text('');
        $('#tabs').hide();
        $("#refresh-lbl").hide();  
        $('#dest-org-section').hide(); 
        if($('#source-org-field').val() !== '') {
            vscode.postMessage({ command: 'loadTypesComponents', sourceOrgId: $(this).val(), refresh:false});
            $("#spinner").show();   
            $(".spinnerlabel").text("Refreshing Components");
    
            $('#dest-org-section').show();
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

    $("#source-org-refresh").on('click', function (e) {
        resetComponents();
        $("#compTypes").hide();
        $("#errors").text('');
        $('#tabs').hide();
        $("#refresh-lbl").hide(); 
        $("#deploystatus").hide();
        $('#dest-org-section').hide(); 
        vscode.postMessage({ command: 'getAuthOrgs', refresh:true});
        $("#spinner").show();   
        $(".spinnerlabel").text("Refreshing Orgs");
    });

    $("#hard-refresh").on('click', function (e) {
        resetComponents();
        refreshTargetView(); 
        vscode.postMessage({ command: 'loadTypesComponents', sourceOrgId: $("#source-org-field").val(), refresh:true});
        $("#spinner").show();   
        $(".spinnerlabel").text("Refreshing Components");
    });

    function resetComponents() {
        types = [];
        selectedTypes.clear();
        componentsMap.clear();
        selectedComps.clear();        
        stdFieldsMap.clear();

        refreshTypes();  
        refreshComponents();

        $('.selected').text('Selected (0)');
        $('#selectedtable').DataTable().clear().draw(); 
        $('#deleteall-row-chk').prop('checked', false);
        $('#exportselected').prop('disabled', true);
        $('#download').prop('disabled', true);
        $('#deleteCmps').prop('disabled', true);
    }

    $('#availabletable').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[4, 'desc'],[1, 'asc'],[2, 'asc']],
        columns: [
            { data: null, sortable: false },
            { data: 'type' },
            { data: 'name' },            
            { data: 'lastModifiedByName' },
            { data: 'lastModifiedDate', "type": "date", width:'200px' },
            { data: 'parent' }
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
            },
            {
                target: 5,
                visible: false
            }
        ],
        rowCallback: function(row, data, dataIndex){
            if (selectedComps.has(data.type + "." + data.name)) {
                var checkbox = $(row).find('.row-chk');
                if(!$(checkbox).prop('checked')) {
                    $(checkbox).prop('checked', true);
                }
                $(row).addClass('select-row');   
            } else {
                var checkbox = $(row).find('.row-chk');
                if($(checkbox).prop('checked')) {
                    $(checkbox).prop('checked', false);
                }
                $(row).removeClass('select-row');    
            }
        },
        language: {
            emptyTable: 'No components are matched to the selected criteria',
            info: "Total: _TOTAL_ component(s) available"
        }
    });

    $('#selectedtable').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[0, 'asc'],[1, 'asc']],
        columns: [
            { data: null, sortable: false },
            { data: 'type' },
            { data: 'name' },            
            { data: 'lastModifiedByName' },
            { data: 'lastModifiedDate', "type": "date", width:'200px' },
            { data: 'source' }
        ],
        columnDefs: [
            {
                orderable: false,
                render: function (data, type, row) {
                    return '<input type="checkbox" class="delete-row-chk" value="' + row.type + "." + row.name + '" checked>';
                },
                targets: 0
            },
            {
                orderable: false,
                render: function (data, type, row) {
                    if (row.dest) {
                        return '<a href="#" class="fileview" data-parent="'+row.parent+'" data-name="'+row.type+"."+row.name+'" style="color:#4daafc">View</a>';
                    } else {
                        return 'N/A';
                    }
                },
                targets: 5
            }
        ],
        language: {
            info: "Total: _TOTAL_ component(s)"
        }
    });

    $(".dd-text-field").on("click", function(e){
        e.stopPropagation();
        if ($(".dd-option-box").is(":hidden")) {            
            $(".dd-option-box").show();
            $(".dd-option-box").css({width: $(this).outerWidth()});
            types.forEach(function(type) {
                type.hidden = false;           
            });
            refreshTypes();
        }        
	});

    $(".dd-text-field").on("input", function(e){
		const txt = $(this).val().toLowerCase();
        types.forEach(function(type) {
            type.hidden = txt !== '' ? !type.name.toLowerCase().startsWith(txt) : false;           
        });
        refreshTypes();
    });

    $('.dd-option-box').on('click', function (e) {
        e.stopPropagation();
    });

    //'All' checkbox
    $(document).on('change', '.dd-select-all', function() {
        $(".spinnerlabel").text("Refreshing Components");
        $("#spinner").show();
        if ($(this).is(':checked')) {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if(!$(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', true);
                    $(chxbox).parent().addClass('select-row');
                    $(chxbox).parent().parent().addClass('select-row');
                    const selectedValue = $(chxbox).val();
                    selectedTypes.add(selectedValue);
                }                
            });
        } else {
            $('.dd-option-chk').each(function(indx, chxbox) {
                if($(chxbox).prop('checked')) {
                    $(chxbox).prop('checked', false);
                    $(chxbox).parent().removeClass('select-row');
                    $(chxbox).parent().parent().removeClass('select-row');
                }                
            });  
            selectedTypes.clear();
        }
        refreshComponents();
        $('.dd-text-field').attr("placeholder", selectedTypes.size+' Type(s) selected');  
        $("#spinner").hide();  
    });

    //Type checkbox
    $(document).on('change', '.dd-option-chk', function() {
        if ($(this).is(':checked')) {
            $(this).parent().addClass('select-row');
            $(this).parent().parent().addClass('select-row');
            selectedTypes.add($(this).val());           
        } else {
            $(this).parent().removeClass('select-row');
            $(this).parent().parent().removeClass('select-row');
            selectedTypes.delete($(this).val());
        }        
        refreshComponents();
        $('.dd-select-all').prop('checked', selectedTypes.size === types.length);
        $('.dd-text-field').attr("placeholder", selectedTypes.size+ ' Type(s) selected');      
    });

	$("body").on("click",function(e){
        $(".dd-text-field").val('');
        $(".dd-option-box").hide();
	});

    $(document).keydown(function(e) {
        if (e.key === "Escape") {
           $(".dd-text-field").val('');
           $(".dd-option-box").hide();
        }
    });
    $(document).mousedown(function(e) {
       if($(e.target)[0]?.classList[0]?.startsWith('dd-')) {
            return;
       } else {
            $(".dd-text-field").val('');
            $(".dd-option-box").hide();
       }
    });

    function refreshTypes() {
        $('.dd-options ui').empty();
        var visibleTypesCount = 0;
        types.forEach(function(type) {
            if(!type.hidden) {
                visibleTypesCount++;
                $('.dd-options ui').append(`
                    <li class="dd-option ${(selectedTypes.has(type.name)) ? 'select-row' : ''}">
                        <div class=${(selectedTypes.has(type.name)) ? 'select-row' : ''}>
                            <input type="checkbox" value=${type.name} id=${type.name} class="dd-option-chk" 
                                    ${selectedTypes.has(type.name)? "checked" : ""}>
                            <label class="dd-option-lbl" for=${type.name}>${type.name} (${type.count})</label>
                        </div>
                    </li>
                `);
            }
        }); 
        $('.dd-text-field').attr("placeholder", selectedTypes.size+ ' Type(s) selected');
        if(types.length === visibleTypesCount) {
            $('#select-all-div').show();
            $('.dd-select-all').prop('checked', selectedTypes.size === types.length);
        } else {
            $('#select-all-div').hide();
        }        
    }

    function refreshComponents() {
        let components = [];
        selectedTypes.forEach(function(type) {
            if(componentsMap.has(type)) {
                components = [...components, ...componentsMap.get(type)];
            }
        }); 
        $('#availabletable').DataTable().clear().rows.add(components).draw();
        $('.available').text('Available ('+components.length+')');
        $('.all-row-chk').prop('checked', false);
        $('#export').prop('disabled', components.length === 0);   
        $('#bulkselection').prop('disabled', components.length === 0);  
    }

    $(document).on('change', '.row-chk', function() {
        let val = $(this).val();
        if ($(this).is(':checked')) {
            selectedComps.set(val, $('#availabletable').DataTable().row($(this).closest('tr')).data());       
        } else {
            selectedComps.delete(val);
        } 
        refreshSelection();
    });

    $(document).on('change', '.delete-row-chk', function() {
        if (!$(this).is(':checked')) {
            selectedComps.delete($(this).val());
        }
        refreshSelection();
    });

    $(document).on('change', '.deleteall-row-chk', function() {
        if (!$(this).is(':checked')) {
            selectedComps.clear();
        }
        refreshSelection();
    });

    $('.all-row-chk').on('change', function() {
        if ($(this).is(':checked')) {
            $('#availabletable').DataTable().rows({ search: "applied" }).data().each(e => {
                selectedComps.set(e.type+"."+e.name, e);  
            });
        } else {
            selectedComps.clear();
        }   
        refreshSelection();
    });

    function refreshSelection() {
        $('.row-chk').each(function(indx, chxbox) {
            $(chxbox).prop('checked', selectedComps.has($(chxbox).val()));
            if(selectedComps.has($(chxbox).val())) {
                $(chxbox).parent().parent().addClass('select-row');
            } else {
                $(chxbox).parent().parent().removeClass('select-row');
            }               
        });

        $('.all-row-chk').prop('checked', $('#availabletable').DataTable().data().length === selectedComps.size);
        $('#packagexml').prop('disabled', selectedComps.size === 0);
        $('#exportselected').prop('disabled', selectedComps.size === 0); 
        $('#download').prop('disabled', selectedComps.size === 0); 
        $('#deleteCmps').prop('disabled', selectedComps.size === 0);

        $('.selected').text('Selected ('+selectedComps.size+')');   
        $('#selectedtable').DataTable().clear().rows.add(Array.from(selectedComps.values())).draw(); 
        $('#selectedtable').DataTable().column(5).visible(false);
        $('#deleteall-row-chk').prop('checked', selectedComps.size > 0);
        refreshTargetView();
    }

    $('#packagexml').on('click', function (e) {
        let packagexml = getPackageXml();
        navigator.clipboard.writeText( `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${packagexml}\t<version>62.0</version>\n</Package>`);
        vscode.postMessage({ command: 'toastMessage', message: 'Package.xml copied to clipboard'});
    });

    $('#export').on('click', function (e) {
        let components = [['Type','Name','Last Modified By','Last Modified Date']];
        Array.from(componentsMap.values()).flat().forEach(e => {
            components.push([e.type, e.name, e.lastModifiedByName, e.lastModifiedDate]);
        });
        navigator.clipboard.writeText(components.map(e => e.join(",")).join("\n"));
        vscode.postMessage({ command: 'toastMessage', message: 'CSV content copied to clipboard'});
    });

    $('#exportselected').on('click', function (e) {
        let components = [['Type','Name','Last Modified By','Last Modified Date']];
        Array.from(selectedComps.values()).forEach(comp => {
            components.push([comp.type, comp.name, comp.lastModifiedByName, comp.lastModifiedDate]);
        });
        navigator.clipboard.writeText(components.map(e => e.join(",")).join("\n"));
        vscode.postMessage({ command: 'toastMessage', message: 'CSV content copied to clipboard'});
    });

    $('#download').on('click', function (e) {
        $(".spinnerlabel").text("Downloading");
        $("#spinner").show();
        let packagexml = getPackageXml();
        vscode.postMessage({ command: 'download', sourceOrgId: $('#source-org-field').val(), packagexml:packagexml});  
    });  

    $('#bulkselection-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: true, width: 500, height:'auto'});
    
    $("#bulkselection").on("click", function(e){
        $('#bulkselection-dialog').dialog("open");
    });

    $("#commit").on("click", function(e){
        vscode.postMessage({ command: 'commit'});
    });

    $('#bulkselect').on('click', function (e) {
        $("#bulkerrors").hide();
        $("#bulkcontinue").hide();
        if($('#bulk-comps').val().trim() !== '') {
            let comps = $('#bulk-comps').val().trim();
            let errors = autoSelection(comps.split('\n'));
            if(errors.length === 0){
                $('#bulkselection-dialog').dialog("close");
            } else {
                let content = '';
                errors.forEach(e => {
                    content += e+'\n';
                });
                $("#bulkerrors").show();
                $("#bulkcontinue").show();
                $("#bulkerrors").find(".errors").val(content);
                let dialog = $("#bulkselection-dialog");
                dialog.dialog("option", "height", "auto");
                dialog.dialog("option", "position", { my: "center", at: "center", of: window });
            }            
        } else {
            $('#bulkselection-dialog').dialog("close");
        }      
    });

    $('#bulkcontinue').on('click', function (e) {
        $('#bulkselection-dialog').dialog("close");
    });  

    $('#dest-org-field').on("change", function(e){
        refreshTargetView();
        if($('#dest-org-field').val() === '') {
            $('#deploy-buttons').hide();        
        } else {
            $('#deploy-buttons').show();
            
        }
    });

    function refreshTargetView() {
        $("#deploystatus").hide(); 
        $('.deployerrors').text('Deployment Errors (0)');
        $('.testfailures').text('Test Class Failures (0)');
        $('.testcoverages').text('Test Coverage (0)');        
        $('#errortable').DataTable().clear().draw(); 
        $('#testerrortable').DataTable().clear().draw(); 
        $('#testcoveragestable').DataTable().clear().draw(); 
        $('#compare').prop('disabled', selectedComps.size === 0 || $('#dest-org-field').val() === '');
        $('#validate').prop('disabled', selectedComps.size === 0 || $('#dest-org-field').val() === ''); 
        $('#deploy').prop('disabled', selectedComps.size === 0 || $('#dest-org-field').val() === ''); 
    }

    $('#test-classes-dialog').dialog({autoOpen: false, modal: true, closeOnEscape: false, width: 500});

    $('#deploy').on('click', function (e) {
        $("#test-classes-dialog").dialog("option", "title", `Deploy Metadata`);
        $('#test-classes-dialog').dialog("open"); 
        $("#deployoption").val('Deploy');
    });

    $('#validate').on('click', function (e) {
        $("#test-classes-dialog").dialog("option", "title", `Validate Metadata`);
        $('#test-classes-dialog').dialog("open");
        $("#deployoption").val('Validate'); 
    });

    $('#deleteCmps').on('click', function (e) {
        $("#test-classes-dialog").dialog("option", "title", `Delete Metadata`);
        $('#test-classes-dialog').dialog("open"); 
        $("#deployoption").val('Delete');
    });  

    $('#deploy-continue').on('click', function (e) {
        if($('#testoption-field').val().trim() === 'RunSpecifiedTests') {
            $('#test-classes').css('border' ,'');
            if($('#test-classes').val().trim() !== '') {
                $('#test-classes-dialog').dialog("close");
                validateOrDeploy($("#deployoption").val() === 'Validate', $("#deployoption").val() === 'Delete');
            } else {
                $('#test-classes').css('border' ,'1px solid #f00');
            }             
        } else {
            $('#test-classes-dialog').dialog("close");
            validateOrDeploy($("#deployoption").val() === 'Validate', $("#deployoption").val() === 'Delete');
        } 
    });  

    function validateOrDeploy(checkOnly, deleteMD) {
        let packagexml = getPackageXml();
        let runTests = '';
        if($(".testoption-field").val() === 'RunSpecifiedTests') {
            $('#test-classes').val().trim().split(',').forEach(cls => {
                runTests += '<met:runTests>'+cls+'</met:runTests>';
            });
        }

        if(deleteMD) {
            vscode.postMessage({ command: 'delete', sourceOrgId: $('#source-org-field').val(), packagexml:packagexml});
        } else {
            vscode.postMessage({ command: 'deploy', packagexml:packagexml, sourceOrgId: $('#source-org-field').val(), destOrgId: $("#dest-org-field").val(), 
                checkOnly: checkOnly, testLevel: $(".testoption-field").val(), testClasses: runTests});
        }

        $("#deploystatus").show();
        $("#deploy-buttons").hide();
        $("#source-org-field").prop('disabled', true);   
        $("#source-org-refresh").hide();   
        $("#dest-org-field").prop('disabled', true);  
        $("#refresh-lbl").hide();   
        $("#source-actions").hide(); 
        $('#availabletable').DataTable().column(0).visible(false);
        $('#selectedtable').DataTable().column(0).visible(false); 
        $("#dd-text-field").prop('disabled', true);   
        $("#errors").text('');

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
        $('.testcoverages').text('Test Coverage (0)');
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
                $("#source-org-field").prop('disabled', false);   
                $("#source-org-refresh").show();   
                $("#refresh-lbl").show();  
                $("#source-actions").show();    
                $('#availabletable').DataTable().column(0).visible(true);
                $('#selectedtable').DataTable().column(0).visible(true);  
                $("#dd-text-field").prop('disabled', false);            
                $("#cancel-deploy").hide();
                if(result.checkOnly === 'true' && result.status === 'Succeeded' && result.runTestsEnabled === 'true') {
                    quickdeployId = result.id;
                    $("#quick-deploy").show();
                }  
                $(".deployment").removeClass("path-notstarted").removeClass("path-running");
                if(result.details?.componentFailures) {
                    if(result.details?.componentFailures?.length > 0) {
                        $('.deployerrors').text('Deployment Errors ('+result.details.componentFailures.length+')');
                        $('#errortable').DataTable().clear().rows.add(result.details.componentFailures).draw(); 
                    } else {
                        $('.deployerrors').text('Deployment Errors (1)');
                        $('#errortable').DataTable().clear().rows.add([result.details.componentFailures]).draw(); 
                    }
                }
                if(result.details?.runTestResult?.numFailures > 0) {
                    $('.testfailures').text('Test Class Failures ('+result.details.runTestResult.numFailures+')');
                    $('#testerrortable').DataTable().clear().rows.add(result.details.runTestResult.failures).draw(); 
                }    
                if(result.details?.runTestResult?.codeCoverageWarnings && result.status !== "Canceled ") {
                    $(".coverage-error").show();
                    $(".coverage-error-label").text(result.details.runTestResult.codeCoverageWarnings.message);
                }   
                if(result.details?.runTestResult?.codeCoverage && result.status !== "Canceled ") {
                    if(result.details.runTestResult.codeCoverage instanceof Array) {
                        var recs = [];
                        result.details.runTestResult.codeCoverage.forEach(e => {
                            recs.push({
                                name: e.name,
                                coverage: e.numLocations > 0 ? Math.trunc((e.numLocations-e.numLocationsNotCovered) / e.numLocations*100)+'%' : 'N/A',
                            });
                        });
                        $('.testcoverages').text('Test Coverage ('+recs.length+')');
                        $('#testcoveragestable').DataTable().clear().rows.add(recs).draw(); 
                    } else {
                        var rec = result.details.runTestResult.codeCoverage;
                        $('.testcoverages').text('Test Coverage (1)');
                        $('#testcoveragestable').DataTable().clear().rows.add([{
                            name: rec.name,
                            coverage: rec.numLocations > 0 ? Math.trunc((rec.numLocations-rec.numLocationsNotCovered) / rec.numLocations*100)+'%' : 'N/A',
                        }]).draw(); 
                    }                   
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
                    $(".testclasses").removeClass("path-notstarted").removeClass("path-running");
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
                $(".retrieve").removeClass("path-notstarted").removeClass("path-running");
                $($(".retrieve")[0].childNodes[0]).text(result.message);
                $("#progressbar").progressbar({"value": 100});  
            } else if(result.stage === "deployment") {
                $(".deployment").removeClass("path-notstarted").addClass("path-running");
                $("#progressbar").progressbar({"value": 0});  
            }
        } 
    }   

    $('#errortable').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
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
    
    $('#testcoveragestable').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
        order: [[0, 'asc']],
        columns: [
            { data: 'name', width:'300px' },
            { data: 'coverage' }
        ],
        language: {
            info: "Total: _TOTAL_ Classes"
        }
    });  
    
    $('#testerrortable').DataTable({
        paging: true,
        pageLength: 100,
        lengthChange: false,
        scrollY: '400px',
        scrollCollapse: true, 
        fixedColumns: true,
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
        if($('#'+e.currentTarget.attributes.name.value).DataTable().page() === 0) {
            $('#'+e.currentTarget.attributes.name.value).DataTable().draw(); 
        }        
    });

    $("#compare").on('click', function (e) {
        $("#errors").text('');
        $(".spinnerlabel").text("Comparing");
        $("#spinner").show();
        let packagexml = getPackageXml();
        vscode.postMessage({ command: 'compare', sourceOrgId: $('#source-org-field').val(), 
            packagexml:packagexml, destOrgId: $("#dest-org-field").val()});  
    });

    $("#selectedtable").on('click', 'a.fileview', function (e) {
        let filename = e.currentTarget.dataset.name;
        let parent = e.currentTarget.dataset.parent;
        let source = selectedComps.get(filename).source;
        let dest = selectedComps.get(filename).dest;
        let files = selectedComps.get(filename).files;
        let scrollTo = '';
        if(parent !== '') {
            scrollTo = selectedComps.get(filename).name.split('.')[1];
        }
        source.forEach((element, index) => {
            vscode.postMessage({ command: 'filePreview', source: element,  dest: dest[index], file: files[index], 
                scrollTo: scrollTo
            }); 
        }); 
    });

    function loadCompareResults(files) {
        const filesLst = new Map();
        files.forEach(file => {
            let filename = file.name;
            if(filename.indexOf("/") >= 0){
                filename = filename.substring(0, filename.indexOf('/'));
            }  
            if(!filesLst.has(filename)) {
                filesLst.set(filename, []);   
            }
            filesLst.get(filename).push(file);       
        });

        Array.from(selectedComps.keys()).forEach(c => {
            var cmp = selectedComps.get(c).parent !== '' ? selectedComps.get(c).parent+'.'+c.split('.')[1] : c;
            if(filesLst.has(cmp)) {
                var comp = selectedComps.get(c);  
                comp['source'] = [];   
                comp['files'] = [];  
                comp['dest'] = [];                
                filesLst.get(cmp).forEach(file => {
                    comp.source.push(file.source);
                    comp.files.push(file.name);
                    comp.dest.push(file.dest);     
                });
            }
        });

        $('#selectedtable').DataTable().column(5).visible(true);
        $('#tabs').tabs('option', 'active', 1);        
        $('#selectedtable').DataTable().clear().rows.add(Array.from(selectedComps.values())).order([[5, 'desc'],[1, 'asc'],[2, 'asc']]).draw();
    }

    
    function autoSelection(components) {
        let types = new Set();
        components.forEach(comp => {
            if(componentsMap.has(comp.split('.')[0])) {
                selectedTypes.add(comp.split('.')[0]);       
                types.add(comp.split('.')[0]);
            }        
        });
        types.forEach(type => {
            componentsMap.get(type).forEach(cmp => {
                if(components.indexOf(cmp.type+"."+cmp.name) >= 0) {
                    selectedComps.set(cmp.type+"."+cmp.name, cmp);
                    components.splice(components.indexOf(cmp.type+"."+cmp.name), 1);
                }
            });
        });
        refreshTypes();
        refreshComponents();
        refreshSelection();
        return components;
    }
});

