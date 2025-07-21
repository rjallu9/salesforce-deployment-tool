"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const stdValueSet_json_1 = __importDefault(require("./assets/stdValueSet.json"));
const path = require('path');
const os = require('os');
const axios = require('axios');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const fs = require('fs');
const AdmZip = require('adm-zip');
let tmpDirectory = '';
let STD_VALUE_SET = stdValueSet_json_1.default;
function activate(context) {
    const disposable = vscode.commands.registerCommand('salesforce-deployment-suite.build', () => {
        const panel = vscode.window.createWebviewPanel('packageBuilder', 'Salesforce Deployment Suite', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'out', 'assets/index.js'));
        const scriptUri = panel.webview.asWebviewUri(scriptPath);
        const cssPath = vscode.Uri.file(path.join(context.extensionPath, 'out', 'assets/index.css'));
        const cssUri = panel.webview.asWebviewUri(cssPath);
        panel.webview.html = getWebviewContent(context.extensionPath, scriptUri, cssUri);
        let orgsList = [];
        let isCancelDeploy = false;
        tmpDirectory = context.globalStorageUri.fsPath + "/tmp";
        panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'getAuthOrgs':
                    var orgsListPath = path.join(context.globalStorageUri.fsPath, 'orgsList.json');
                    if (fs.existsSync(orgsListPath) && !message.refresh) {
                        orgsList = JSON.parse(fs.readFileSync(orgsListPath, 'utf-8'));
                        panel.webview.postMessage({ command: 'orgsList', orgs: orgsList });
                    }
                    else {
                        getAuthOrgs().then((result) => {
                            orgsList = result;
                            panel.webview.postMessage({ command: 'orgsList', orgs: result });
                            const dir = path.dirname(orgsListPath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFile(orgsListPath, JSON.stringify(orgsList, null, 2), 'utf8', (err) => {
                            });
                        });
                    }
                    break;
                case 'loadTypesComponents':
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    validateSession(sourceOrg.accessToken, sourceOrg.instanceUrl, message.sourceOrgId)
                        .then((result) => {
                        if (result.valid) {
                            if (result.orgsList) {
                                orgsList = result.orgsList;
                                sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                                fs.writeFile(context.globalStorageUri.fsPath + "/orgsList.json", JSON.stringify(orgsList, null, 2), 'utf8', (err) => { });
                            }
                            var metdataPath = path.join(context.globalStorageUri.fsPath + "/" + sourceOrg.orgId, 'metadata.json');
                            if (fs.existsSync(metdataPath) && !message.refresh) {
                                const metadata = new Map(JSON.parse(fs.readFileSync(metdataPath, 'utf-8')));
                                const timestamp = metadata.get('Timestamp');
                                metadata.delete('Timestamp');
                                for (const [key, value] of metadata) {
                                    panel.webview.postMessage({ command: 'components', components: value, type: key });
                                }
                                panel.webview.postMessage({ command: 'typesComponents', components: '', timestamp });
                            }
                            else {
                                const now = new Date();
                                getTypesComponents(sourceOrg.accessToken, sourceOrg.instanceUrl, context.globalStorageUri.fsPath, panel)
                                    .then((data) => {
                                    panel.webview.postMessage({ command: 'typesComponents', components: data,
                                        timestamp: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}` });
                                    saveMetadata(data.components, data.sobjects, context.globalStorageUri.fsPath, sourceOrg.orgId);
                                });
                            }
                        }
                    }).catch((error) => {
                        panel.webview.postMessage({ command: 'error', message: 'Unable to connect to the Org.' });
                    });
                    break;
                case 'deploy':
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieve", message: 'Retrieve Initiated' } });
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    validateSession(destOrg.accessToken, destOrg.instanceUrl, message.destOrgId)
                        .then((result) => {
                        if (result.valid) {
                            retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                                panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieve", message: 'Retrieve Inprogress' } });
                                let retrieveJobId = result;
                                let intervalId = setInterval(() => {
                                    retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result) => {
                                        if (result.done === 'true') {
                                            panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieveCompleted", message: 'Retrieve Completed' } });
                                            clearInterval(intervalId);
                                            if (!isCancelDeploy) {
                                                panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment",
                                                        message: message.checkOnly ? 'Validation Initiated' : 'Deployment Initiated' } });
                                                deploy(destOrg.accessToken, destOrg.instanceUrl, result.zipFile, message.checkOnly, message.testLevel, message.testClasses).then((result) => {
                                                    let deployJobId = result;
                                                    let deployIntervalId = setInterval(() => {
                                                        if (isCancelDeploy) {
                                                            cancelDeploy(destOrg.accessToken, destOrg.instanceUrl, deployJobId);
                                                            isCancelDeploy = false;
                                                        }
                                                        deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result) => {
                                                            if (result.done === 'true') {
                                                                clearInterval(deployIntervalId);
                                                            }
                                                            result['stage'] = "deploymentStatus";
                                                            panel.webview.postMessage({ command: 'deployStatus', result: result });
                                                        }).catch((error) => {
                                                            clearInterval(deployIntervalId);
                                                        });
                                                    }, 2000);
                                                });
                                            }
                                            else {
                                                panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment",
                                                        message: message.checkOnly ? 'Validation Cancelled' : 'Deployment Cancelled' } });
                                            }
                                        }
                                    }).catch((error) => {
                                        clearInterval(intervalId);
                                    });
                                }, 1000);
                            });
                        }
                    }).catch((error) => {
                        panel.webview.postMessage({ command: 'previewerror', message: 'Unable to connect to the Org.' });
                    });
                    break;
                case 'quickDeploy':
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment", message: 'Deployment Initiated' } });
                    quickDeploy(destOrg.accessToken, destOrg.instanceUrl, message.id).then((result) => {
                        let deployJobId = result;
                        let intervalId = setInterval(() => {
                            deployStatus(destOrg.accessToken, destOrg.instanceUrl, deployJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(intervalId);
                                }
                                result['stage'] = "deploymentStatus";
                                panel.webview.postMessage({ command: 'deployStatus', result: result });
                            }).catch((error) => {
                                clearInterval(intervalId);
                            });
                        }, 2000);
                    });
                    break;
                case 'cancelDeploy':
                    isCancelDeploy = true;
                    break;
                case 'toastMessage':
                    vscode.window.showInformationMessage(`${message.message}`);
                    break;
                case 'compare':
                    let sourceOrgFiles = new Map();
                    let destOrgFiles = new Map();
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    var destOrg = orgsList.find((org) => org.orgId === message.destOrgId);
                    var time = Date.now();
                    let sourceProcess = false, destProcess = false;
                    retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                        let retrieveJobId = result;
                        let intervalId = setInterval(() => {
                            retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(intervalId);
                                    sourceOrgFiles = result.fileNames;
                                    extractComponents(result.zipFile, tmpDirectory + '/' + time, sourceOrg.alias);
                                    sourceProcess = true;
                                }
                            }).catch((error) => {
                                vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
                                clearInterval(intervalId);
                            });
                        }, 1000);
                    });
                    validateSession(destOrg.accessToken, destOrg.instanceUrl, message.destOrgId)
                        .then((result) => {
                        if (result.valid) {
                            retrieve(destOrg.accessToken, destOrg.instanceUrl, message.packagexml).then((result) => {
                                let destRetrieveJobId = result;
                                let destIntervalId = setInterval(() => {
                                    retrieveStatus(destOrg.accessToken, destOrg.instanceUrl, destRetrieveJobId).then((result) => {
                                        if (result.done === 'true') {
                                            clearInterval(destIntervalId);
                                            destOrgFiles = result.fileNames;
                                            extractComponents(result.zipFile, tmpDirectory + '/' + time, destOrg.alias);
                                            destProcess = true;
                                        }
                                    }).catch((error) => {
                                        vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
                                        clearInterval(destIntervalId);
                                    });
                                }, 1000);
                            });
                        }
                    }).catch((error) => {
                        panel.webview.postMessage({ command: 'previewerror', message: 'Unable to connect to the Org.' });
                    });
                    let responseIntervalId = setInterval(() => {
                        if (sourceProcess && destProcess) {
                            postCompareResults(sourceOrgFiles, destOrgFiles, tmpDirectory + "/" + time + "/" + sourceOrg.alias, tmpDirectory + "/" + time + "/" + destOrg.alias, panel);
                            clearInterval(responseIntervalId);
                        }
                    }, 1000);
                    break;
                case 'filePreview':
                    let title = message.file + ': Source ↔ Target';
                    vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(message.source), vscode.Uri.file(message.dest), title, { preview: false });
                    if (message.scrollTo !== '') {
                        setTimeout(() => scrollTo(message.scrollTo), 1000);
                    }
                    break;
                case 'download':
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    retrieve(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                        let retrieveJobId = result;
                        let intervalId = setInterval(() => {
                            retrieveStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, retrieveJobId).then((result) => {
                                if (result.done === 'true') {
                                    const buffer = Buffer.from(result.zipFile, 'base64');
                                    const downloadsPath = path.join(os.homedir(), 'Downloads');
                                    let zipFilePath = path.join(downloadsPath, 'download.zip');
                                    let counter = 1;
                                    while (fs.existsSync(zipFilePath)) {
                                        zipFilePath = path.join(downloadsPath, 'download(' + counter + ').zip');
                                        counter++;
                                    }
                                    fs.writeFileSync(zipFilePath, buffer);
                                    clearInterval(intervalId);
                                    panel.webview.postMessage({ command: 'hidespinner' });
                                    vscode.window.showInformationMessage(`Download completed.`);
                                    const platform = process.platform;
                                    if (platform === 'win32') {
                                        exec(`start "" "${downloadsPath}"`);
                                    }
                                    else if (platform === 'darwin') {
                                        exec(`open "${downloadsPath}"`);
                                    }
                                    else {
                                        exec(`xdg-open "${downloadsPath}"`);
                                    }
                                }
                            }).catch((error) => {
                                vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
                                clearInterval(intervalId);
                            });
                        }, 1000);
                    });
                    break;
                case 'delete':
                    var sourceOrg = orgsList.find((org) => org.orgId === message.sourceOrgId);
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieve", message: 'Preperation Started' } });
                    panel.webview.postMessage({ command: 'deployStatus', result: { stage: "retrieveCompleted", message: 'Preperation Completed' } });
                    deleteMD(sourceOrg.accessToken, sourceOrg.instanceUrl, message.packagexml).then((result) => {
                        panel.webview.postMessage({ command: 'deployStatus', result: { stage: "deployment", message: 'Deployment Initiated' } });
                        let deployJobId = result;
                        let deployIntervalId = setInterval(() => {
                            if (isCancelDeploy) {
                                cancelDeploy(sourceOrg.accessToken, sourceOrg.instanceUrl, deployJobId);
                                isCancelDeploy = false;
                            }
                            deployStatus(sourceOrg.accessToken, sourceOrg.instanceUrl, deployJobId).then((result) => {
                                if (result.done === 'true') {
                                    clearInterval(deployIntervalId);
                                }
                                result['stage'] = "deploymentStatus";
                                panel.webview.postMessage({ command: 'deployStatus', result: result });
                            }).catch((error) => {
                                clearInterval(deployIntervalId);
                            });
                        }, 2000);
                    });
                    break;
                default:
                    console.log('Unknown command:', message.command);
            }
        });
        panel.onDidDispose(() => {
            if (tmpDirectory && fs.existsSync(tmpDirectory)) {
                try {
                    fs.rmSync(tmpDirectory, { recursive: true, force: true });
                }
                catch (err) {
                }
            }
        });
    });
    context.subscriptions.push(disposable);
}
async function scrollTo(text) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const doc = editor.document;
    const textPosition = doc.getText().indexOf(text);
    if (textPosition === -1) {
        return;
    }
    const pos = doc.positionAt(textPosition);
    const range = new vscode.Range(pos, pos);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}
function validateSession(accessToken, endPoint, orgId) {
    return new Promise((resolve, reject) => {
        sendSoapAPIRequest(accessToken, endPoint, '<urn:getUserInfo/>')
            .then((result) => {
            resolve({ valid: true });
        }).catch((error) => {
            if (error.indexOf('INVALID_SESSION_ID') >= 0) {
                let attempts = 0;
                function retry() {
                    attempts++;
                    getAuthOrgs().then((orgsList) => {
                        let org = orgsList.find((org) => org.orgId === orgId);
                        return sendSoapAPIRequest(org.accessToken, org.instanceUrl, '<urn:getUserInfo/>')
                            .then((res) => {
                            resolve({ valid: true, orgsList });
                        })
                            .catch((err) => {
                            if (attempts < 5) {
                                retry();
                            }
                            else {
                                reject(new Error('Max retries reached. Session validation failed.'));
                            }
                        });
                    });
                }
                retry();
            }
        });
        ;
    });
}
function saveMetadata(metadata, sobjects, fsPath, orgId) {
    Array.from(sobjects.values()).flat().forEach((name) => {
        metadata.get('CustomField').push({ name, type: 'CustomField', lastModifiedByName: '', lastModifiedDate: '', parent: 'CustomObject' });
    });
    const now = new Date();
    metadata.set('Timestamp', `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    const dir = path.dirname(fsPath + "/" + orgId + "/metadata.json");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFile(fsPath + "/" + orgId + "/metadata.json", JSON.stringify(Array.from(metadata), null, 2), 'utf8', (err) => {
        if (err) {
            vscode.window.showErrorMessage(`Error..!! ${err}`);
        }
    });
}
function postCompareResults(sourceOrgFiles, destOrgFiles, sourceOrgPath, destOrgPath, panel) {
    let files = [];
    sourceOrgFiles.forEach((value, key) => {
        let tmp = { name: key, source: sourceOrgPath + "/" + value, dest: "" };
        if (destOrgFiles.has(key)) {
            tmp.dest = destOrgPath + "/" + destOrgFiles.get(key);
        }
        files.push(tmp);
    });
    panel.webview.postMessage({ command: 'compareResults', files: files });
}
function extractComponents(zipfile, directory, alias) {
    const buffer = Buffer.from(zipfile, 'base64');
    if (!fs.existsSync(directory + "/" + alias)) {
        fs.mkdirSync(directory + "/" + alias, { recursive: true });
    }
    const zipFilePath = path.join(directory, alias + '.zip');
    fs.writeFileSync(zipFilePath, buffer);
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(directory + "/" + alias, true);
}
function cancelDeploy(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:cancelDeploy><met:String>' + deployJobId + '</met:String></met:cancelDeploy>')
            .then((result) => {
            const res = result['cancelDeployResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            vscode.window.showErrorMessage(`Error: ${JSON.stringify(error)}`);
            reject(error);
        });
    });
}
function quickDeploy(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:deployRecentValidation><met:validationId>' + deployJobId +
            '</met:validationId></met:deployRecentValidation>')
            .then((result) => {
            const res = result['deployRecentValidationResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function deployStatus(accessToken, endPoint, deployJobId) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:checkDeployStatus><met:asyncProcessId>' + deployJobId +
            '</met:asyncProcessId><met:includeDetails>true</met:includeDetails></met:checkDeployStatus>')
            .then((result) => {
            const res = result['checkDeployStatusResponse']['result'];
            resolve(res);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function deploy(accessToken, endPoint, zipfile, checkOnly, testLevel, testClasses) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:deploy><met:ZipFile>' + zipfile + '</met:ZipFile><met:DeployOptions>' +
            '<met:checkOnly>' + checkOnly + '</met:checkOnly><met:testLevel>' + testLevel + '</met:testLevel>' + testClasses +
            '<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>')
            .then((result) => {
            const retrieveId = result['deployResponse']['result']['id'];
            resolve(retrieveId);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function deleteMD(accessToken, endPoint, packagexml) {
    const zip = new AdmZip();
    const emptypackage = `<?xml version="1.0" encoding="UTF-8"?>
							<Package xmlns="http://soap.sforce.com/2006/04/metadata">
								<version>62.0</version>
							</Package>`;
    const packagefull = `<?xml version="1.0" encoding="UTF-8"?>
							<Package xmlns="http://soap.sforce.com/2006/04/metadata">
								${packagexml}
								<version>62.0</version>
							</Package>`;
    zip.addFile("destructiveChanges.xml", Buffer.from(packagefull, "utf8"));
    zip.addFile("package.xml", Buffer.from(emptypackage, "utf8"));
    const zipBuffer = zip.toBuffer();
    const base64Zip = zipBuffer.toString("base64");
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:deploy><met:ZipFile>' + base64Zip + '</met:ZipFile><met:DeployOptions>' +
            '<met:purgeOnDelete>true</met:purgeOnDelete>' +
            '<met:singlePackage>true</met:singlePackage></met:DeployOptions></met:deploy>')
            .then((result) => {
            const retrieveId = result['deployResponse']['result']['id'];
            resolve(retrieveId);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function retrieveStatus(accessToken, endPoint, retrieveJobId) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:checkRetrieveStatus><met:asyncProcessId>' + retrieveJobId +
            '</met:asyncProcessId><met:includeZip>true</met:includeZip></met:checkRetrieveStatus>')
            .then((result) => {
            const res = result['checkRetrieveStatusResponse']['result'];
            let fileNames = new Map();
            if (res['done'] === 'true') {
                let tmp = res['fileProperties'] instanceof Array ? res['fileProperties'] : [res['fileProperties']];
                tmp.forEach((file) => {
                    fileNames.set(file.type + "." + file.fullName, file.fileName);
                });
            }
            resolve({
                done: res['done'],
                zipFile: res['zipFile'],
                fileNames: fileNames
            });
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function retrieve(accessToken, endPoint, packagexml) {
    return new Promise((resolve, reject) => {
        sendSoapMDRequest(accessToken, endPoint, '<met:retrieve><met:retrieveRequest><met:apiVersion>62.0</met:apiVersion>' +
            '<met:singlePackage>true</met:singlePackage><met:unpackaged>' + packagexml + '</met:unpackaged></met:retrieveRequest></met:retrieve>')
            .then((result) => {
            const retrieveId = result['retrieveResponse']['result']['id'];
            resolve(retrieveId);
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function getTypesComponents(accessToken, endPoint, globalStorageUri, panel) {
    return new Promise((resolve, reject) => {
        let components = new Map();
        let sobjects = new Map();
        sendSoapMDRequest(accessToken, endPoint, '<met:describeMetadata><met:asOfVersion>62.0</met:asOfVersion></met:describeMetadata>')
            .then((result) => {
            const types = result['describeMetadataResponse']['result']['metadataObjects'];
            const typesList = [];
            types.forEach((element) => {
                typesList.push({ name: element['xmlName'], inFolder: element['inFolder'], parent: '' });
                if (element['childXmlNames']) {
                    let tmp = element['childXmlNames'] instanceof Array ? element['childXmlNames'] : [element['childXmlNames']];
                    tmp.forEach((childname) => {
                        typesList.push({ name: childname, inFolder: 'false', parent: element['xmlName'] });
                    });
                }
            });
            panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components(0/' + typesList.length + ')' });
            Promise.all(typesList.map((e) => {
                return sendSoapMDRequest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>'
                    + (e.inFolder === 'true' ? (e.name === 'EmailTemplate' ? 'EmailFolder' : e.name + 'Folder') : e.name)
                    + '</met:type></met:queries></met:listMetadata>')
                    .then((result) => {
                    const comps = result['listMetadataResponse'];
                    let results = buildComponents(comps, e.parent);
                    if (e.inFolder === 'true') {
                        let folderresults = [];
                        return Promise.all(results.map((element) => {
                            return sendSoapMDRequest(accessToken, endPoint, '<met:listMetadata><met:queries><met:type>' + e.name +
                                '</met:type><met:folder>' + element.name + '</met:folder></met:queries></met:listMetadata>')
                                .then((result) => {
                                const comps = result['listMetadataResponse'];
                                let fldresults = buildComponents(comps, e.parent);
                                element.type = e.name;
                                folderresults = [...folderresults, ...fldresults, element];
                            });
                        }))
                            .then(() => {
                            components.set(e.name, folderresults);
                            panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components(' + components.size + '/' + typesList.length + ')' });
                            panel.webview.postMessage({ command: 'components', components: folderresults, type: e.name });
                        }).catch(error => {
                            vscode.window.showErrorMessage(`Error ${error}`);
                        });
                    }
                    else if (e.name === 'CustomObject') {
                        components.set(e.name, results);
                        panel.webview.postMessage({ command: 'components', components: results, type: e.name });
                        const mdobjects = new Set(results.map(obj => obj.name));
                        return sendSoapAPIRequest(accessToken, endPoint, '<urn:describeGlobal/>')
                            .then((result) => {
                            const comps = result['describeGlobalResponse']['result']['sobjects'];
                            let objects = [];
                            comps.forEach((e) => {
                                if (e['custom'] === 'false' && e['layoutable'] === 'true' && mdobjects.has(e['name'])) {
                                    objects.push(e['name']);
                                }
                            });
                            const chunks = [];
                            for (let i = 0; i < objects.length; i += 100) {
                                chunks.push(objects.slice(i, i + 100));
                            }
                            return Promise.all(chunks.map((chunk) => {
                                var payload = '';
                                chunk.forEach((e) => {
                                    payload += '<urn:sObjectType>' + e + '</urn:sObjectType>';
                                });
                                return sendSoapAPIRequest(accessToken, endPoint, '<urn:describeSObjects>' + payload + '</urn:describeSObjects>')
                                    .then((result) => {
                                    const objs = result['describeSObjectsResponse']['result'];
                                    const exclFields = new Set(['Id', 'IsDeleted', 'CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate',
                                        'LastReferencedDate', 'LastViewedDate', 'SystemModstamp', 'MasterRecordId', 'LastActivityDate']);
                                    objs.forEach((obj) => {
                                        let tmp = [];
                                        obj['fields'].forEach((e) => {
                                            if (e['custom'] === 'false' && !exclFields.has(e['name']) && (e['compoundFieldName'] === undefined || e['compoundFieldName'] === 'Name')) {
                                                tmp.push(obj['name'] + '.' + e['name']);
                                            }
                                        });
                                        sobjects.set(obj['name'], tmp);
                                        panel.webview.postMessage({ command: 'stdFields', name: obj['name'], fields: tmp });
                                    });
                                }).catch(error => {
                                    vscode.window.showErrorMessage(`Error ${error}`);
                                });
                            }))
                                .then(() => {
                            }).catch(error => {
                                vscode.window.showErrorMessage(`Error ${error}`);
                            });
                        }).catch(error => {
                            vscode.window.showErrorMessage(`Error ${error}`);
                        });
                    }
                    else {
                        if (e.name === 'StandardValueSet') {
                            results = [];
                            STD_VALUE_SET.forEach((e) => {
                                results.push({ name: e, type: 'StandardValueSet', lastModifiedByName: '', lastModifiedDate: '', parent: '' });
                            });
                        }
                        components.set(e.name, results);
                        panel.webview.postMessage({ command: 'loading', message: 'Refreshing Components(' + components.size + '/' + typesList.length + ')' });
                        panel.webview.postMessage({ command: 'components', components: results, type: e.name });
                    }
                }).catch(error => {
                    vscode.window.showErrorMessage(`Error ${error}`);
                });
            }))
                .then(() => {
                resolve({ 'components': components, 'sobjects': sobjects });
            }).catch(error => {
                vscode.window.showErrorMessage(`Error ${error}`);
            });
        })
            .catch((error) => {
            reject(error);
        });
    });
}
function buildComponents(comps, parent) {
    let results = [];
    let auditDate = '1970-01-01T00:00:00.000Z';
    if (comps !== "") {
        let tmp = comps['result'] instanceof Array ? comps['result'] : [comps['result']];
        results = tmp.map((comp) => ({
            name: comp['fullName'],
            type: comp['type'],
            parent: parent,
            lastModifiedByName: comp['lastModifiedByName'],
            lastModifiedDate: comp['lastModifiedDate'] !== auditDate ? new Date(comp['lastModifiedDate']).toLocaleDateString() :
                comp['createdDate'] !== auditDate ? new Date(comp['createdDate']).toLocaleDateString() : ''
        }));
        results = Array.from(new Map(results.map(item => [item.type + item.name, item])).values());
    }
    return results;
}
function sendSoapMDRequest(accessToken, endPoint, body) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    let reuest = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">' +
        '<soapenv:Header><met:SessionHeader><met:sessionId>' + accessToken + '</met:sessionId></met:SessionHeader></soapenv:Header>' +
        '<soapenv:Body>' + body + '</soapenv:Body></soapenv:Envelope>';
    return new Promise((resolve, reject) => {
        axios.post(endPoint + "/services/Soap/m/62.0", reuest, { headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'Update',
            },
        }).then((response) => {
            parser.parseString(response.data, (err, result) => {
                if (err) {
                    vscode.window.showErrorMessage("Error parsing SOAP XML:", err);
                    return;
                }
                resolve(result['soapenv:Envelope']['soapenv:Body']);
            });
        })
            .catch((error) => {
            parser.parseString(error.response.data, (err, result) => {
                reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
            });
        });
    });
}
function sendSoapAPIRequest(accessToken, endPoint, body) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    let request = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">' +
        '<soapenv:Header><urn:SessionHeader><urn:sessionId>' + accessToken + '</urn:sessionId></urn:SessionHeader></soapenv:Header>' +
        '<soapenv:Body>' + body + '</soapenv:Body></soapenv:Envelope>';
    return new Promise((resolve, reject) => {
        axios.post(endPoint + "/services/Soap/u/62.0", request, { headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'Update',
            },
        }).then((response) => {
            parser.parseString(response.data, (err, result) => {
                if (err) {
                    vscode.window.showErrorMessage("Error parsing SOAP XML:", err);
                    return;
                }
                resolve(result['soapenv:Envelope']['soapenv:Body']);
            });
        })
            .catch((error) => {
            parser.parseString(error.response.data, (err, result) => {
                reject(result['soapenv:Envelope']['soapenv:Body']['soapenv:Fault']['faultstring']);
            });
        });
    });
}
function getAuthOrgs() {
    return new Promise((resolve, reject) => {
        exec('sf org list --json', (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${error}`);
            }
            else {
                try {
                    const data = JSON.parse(stdout).result;
                    const orgList = [];
                    const orgs = [];
                    const orgIds = [];
                    orgs.push(...data.other, ...data.sandboxes, ...data.nonScratchOrgs, ...data.devHubs, ...data.scratchOrgs);
                    orgs.forEach((org) => {
                        if ((org.connectedStatus === 'Connected' || org.status === 'Active') && orgIds.indexOf(org['orgId']) < 0) {
                            orgList.push({
                                name: org['alias'] + '(' + org['username'] + ')',
                                alias: org['alias'],
                                orgId: org['orgId'],
                                accessToken: org['accessToken'],
                                instanceUrl: org['instanceUrl']
                            });
                            orgIds.push(org['orgId']);
                        }
                    });
                    resolve(orgList);
                }
                catch (parseError) {
                    reject(`Parse Error: ${parseError.message}`);
                }
            }
        });
    });
}
function refreshOrgs() {
    return new Promise((resolve, reject) => {
        const orgsDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.sfdx');
        const alias = JSON.parse(fs.readFileSync(orgsDir + '/alias.json', 'utf-8'));
        console.log(alias.orgs);
        /*fs.readFil(orgsDir+'/alias.json', (err, files) => {
            if (err) {
                console.error("Error reading orgs directory:", err);
                return;
            }

            const orgs = files.map(file => path.basename(file, '.json'));
            console.log("Authorized Orgs:", orgs);
        });*/
    });
}
function getWebviewContent(basedpath, scriptUri, cssUri) {
    return `<!doctype html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Salesforce Deployment Suite</title>
				<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
				<script src="https://code.jquery.com/ui/1.14.1/jquery-ui.min.js"></script>
				<script src="https://cdn.datatables.net/2.1.8/js/dataTables.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.min.css">
				<script src="https://cdn.datatables.net/select/2.1.0/js/dataTables.select.min.js"></script>				
				<link rel="stylesheet" href="https://cdn.datatables.net/select/2.1.0/css/select.dataTables.min.css">
				<link rel="stylesheet" href="https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css">
			</head>
			<body>	
				<div style="margin: 20px;">
					<div style="display:flex;justify-content: space-between;align-items: center;">	
						<h1>Salesforce Deployment Suite</h1>		
						<a href="https://github.com/rjallu9/salesforce-deployment-suite/issues" title="Report issue" style="height"25px;">
							<svg width="25px" height="25px" viewBox="0 0 36 36" version="1.1"  preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
								<circle cx="18" cy="18" r="14" fill="#0078d4"/>
								<text x="18" y="20" font-family="Arial" font-size="20" text-anchor="middle" alignment-baseline="middle" fill="white">?</text>
							</svg>
						</a>		
					</div>
					<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">	
						<div style="display:flex;">		
							<div id="source-org" style="margin-right:5px;display:none;">	
								<label for="text" for="source-org-field" class="top-label">Source Org:</label>
								<select type="text" class="source-org-field" id="source-org-field" style="height:36px;">
								</select>		
							</div>
							<div>
								<p id="source-org-refresh" style="margin-bottom:0;margin-top:25px;margin-right:5px;cursor:pointer;display:none;" title="Refresh Orgs">
									<svg width="25" height="25" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
										<circle cx="512" cy="512" r="512" fill="#0078d4"></circle>
										<path d="M512 281.6c71.221 0 136.396 32.619 179.2 85.526V256h51.2v204.8H537.6v-51.2h121.511c-32.857-47.165-87.235-76.8-147.111-76.8-98.97 0-179.2 80.23-179.2 179.2 0 98.97 80.23 179.2 179.2 179.2v-.02c73.665 0 138.994-44.857 166.176-111.988l47.458 19.216C690.689 684.711 606.7 742.38 512 742.38v.02c-127.246 0-230.4-103.154-230.4-230.4 0-127.246 103.154-230.4 230.4-230.4z" fill="white" fill-rule="nonzero"></path>
									</svg>
								</p>
							</div>
							<div id="compTypes" style="display:none;flex:1;">
								<div class="form-panel">
									<div>
										<div style="float:left;" >
											<div>	
												<label for="text" for="dd-text-field" class="top-label">Type: </label>
												<input type="text" class="dd-text-field" id="dd-text-field"></input>								
												<span style="margin-left: -19px;color: #888;">
													<svg width="15" height="15" viewBox="0 0 24 12" fill="#cccccc;" xmlns="http://www.w3.org/2000/svg" style="color: #cccccc;">
														<path d="M6 9l6 6 6-6" stroke="#cccccc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
													</svg>
												</span>
											</div>
											<div class="dd-option-box">
												<div style="padding:5px 10px 5px 10px;" id="select-all-div">
													<input type="checkbox" value="All" class="dd-select-all">
													<label for="select-all">All</label>
												</div>
												<div class="dd-options">
													<ui style="list-style-type: none;">                       
													</ui>
												</div>
											</div>
										</div>
									</div>
								</div>				
							</div>	
						</div>
						<div style="display:flex;">																																			
							<div id="dest-org" style="display:none;">
								<label for="text" for="dest-org-field" class="top-label">Target Org: </label>
								<select type="text" class="dest-org-field" id="dest-org-field" style="height:36px;"></select>	
							</div>	
							<div id="deploy-buttons" style="display:none;">
								<div style="display:flex;">
									<button type="button" style="margin-top:22px;margin-left:5px;width:75px;height:35px;" id="compare" disabled>Compare</button>							
									<button type="button" style="margin-top:22px;margin-left:5px;width:75px;height:35px;" id="validate" disabled>Validate</button>												
									<button type="button" style="margin-top:22px;margin-left:5px;width:75px;height:35px;" id="deploy" disabled>Deploy</button>
								</div>
							</div>
						</div>	
					</div>
					<p style="color:#f14c4c;margin-bottom:0;margin-top:5px;" id="errors"></p>
					<div id="deploystatus" style="display:none">
						<p><span id="deploylabel">Deployment Status:</span> &nbsp;&nbsp; 
							<a href="#" id="quick-deploy" style="display:none">Quick Deploy</a>
							<a href="#" id="cancel-deploy" style="display:none">Cancel Deployment</a>
						</p>
						<ul class="path-list"></ul>							
						<div id="progressbar" class="progressbar"></div>
						<div class="coverage-error" style="display:none;"><p class="coverage-error-label"></p></div>
					</div>
					<p id="refresh-lbl" style="display:none;">
						<span id="refreshlabel">Last Refresh Date:</span>. Please click <a href="#" id="hard-refresh">here</a> to refresh.
					</p>
					<div id="tabs" style="margin-top:10px;display:none;">
						<ul>
							<li class="tab" name="availabletable"><a href="#available" class="available">Available (0)</a></li>
							<li class="tab" name="selectedtable"><a href="#selected" class="selected">Selected (0)</a></li>
							<li class="tab" name="errortable"><a href="#deployerrors" class='deployerrors'>Deployment Errors</a></li>
							<li class="tab" name="testcoveragestable"><a href="#testcoverages" class='testcoverages'>Test Coverage</a></li>
							<li class="tab" name="testerrortable"><a href="#testfailures" class='testfailures'>Test Class Failures</a></li>
						</ul>
						<div id="available">
							<table id="availabletable" class="display" style="width:100%">
								<thead>
									<tr>
										<th><input type="checkbox" id="all-row-chk" class='all-row-chk'/></th>	
										<th>Type</th>
										<th>Name</th>
										<th>Last Modified By</th>
										<th>Last Modified Date</th>
									</tr>
								</thead>
							</table>
							<div id="source-actions">
								<button type="button" id="export" style="width:75px;" disabled>Export All</button>
								<button type="button" style="width: 110px;" id="exportselected" disabled>Export Selected</button>
								<button type="button" style="width: 110px;" id="bulkselection" disabled>Bulk Selection</button>
								<div id="bulkselection-dialog" title="Bulk Selection">
									<p>Provide the names of the components in the format type.name(ex. CustomField.Account.Phone) in a new line.</p>
									<textarea id="bulk-comps" name="bulk-comps" rows="18" style="line-height:20px;scrollbar-width:thin;resize:none;width:100%;"></textarea>
									<div id="bulkerrors" style="display:none;">
										<p style="color: red;font-weight: bold;margin-bottom:0;">Errors:</p>
										<textarea class="errors" rows="9" style="line-height: 20px;scrollbar-width:thin;resize: none;width:100%;"></textarea>
									</div>									
									<button type="button" style="width:50px;float:right;padding: 5px;margin-right:-4px;" id="bulkselect">Select</button>
									<button type="button" style="width:70px;float:right;padding: 5px;margin-right:5px;display:none;" id="bulkcontinue">Continue</button>
								</div>
								<button type="button" style="width:100px;"  id="packagexml" disabled>Package.xml</button>								
								<button type="button" style="width:130px;" id="download" disabled>Download (Source)</button>								
								<button type="button" style="width:110px;" id="deleteCmps" disabled>Delete (Source)</button>
							</div>	
						</div>
						<div id="selected">
							<table id="selectedtable" class="display" style="width:100%">
								<thead>
									<tr>	
										<th><input type="checkbox" id="deleteall-row-chk" class="deleteall-row-chk"/></th>	
										<th>Type</th>
										<th>Name</th>
										<th>Last Modified By</th>
										<th>Last Modified Date</th>	
										<th>Compare</th>										
									</tr>
								</thead>
							</table>
						</div>
						<div id="deployerrors">
							<table id="errortable">
								<thead>
									<tr>	
										<th>API Name</th>
										<th>Type</th>
										<th>Line</th>
										<th>Column</th>
										<th>Error Message</th>
									</tr>
								</thead>
							</table>
						</div>
						<div id="testcoverages">
							<table id="testcoveragestable">
								<thead>
									<tr>	
										<th>Class Name</th>
										<th>Coverage</th>
									</tr>
								</thead>
							</table>
						</div>
						<div id="testfailures">
							<table id="testerrortable">
								<thead>
									<tr>	
										<th>Class Name</th>
										<th>Method Name</th>
										<th>Error Message</th>
									</tr>
								</thead>
							</table>
						</div>
					</div>
				</div>
				<div id="spinner" class="spinner">
					<div class="cv-spinner">
						<span class="spinner-circle"></span>
						<p style="margin-left: 5px;" class="spinnerlabel">Initializing</p>
					</div>
				</div>				
				<div id="test-classes-dialog" title="Test Classes">
					<div style="display:flex">
						<label for="text" for="testoption-field" style="margin-top:7px;">Test Options:&nbsp;&nbsp;</label>
						<select type="text" class="testoption-field" id="testoption-field" style="height:33px;width:150px;">
							<option value="NoTestRun">Default</option>
							<option value="RunLocalTests">Run local tests</option>
							<option value="RunAllTestsInOrg">Run all tests</option>
							<option value="RunSpecifiedTests">Run specified tests</option>
						</select>
						<input type="hidden" id="deployoption" value="">	
					</div>
					<p>Provide the names of the test classes in a comma-seprated list.</p>
					<textarea id="test-classes" name="test-classes" rows="15" style="line-height:20px;scrollbar-width:thin;resize:none;width:100%;"></textarea>
					<button type="button" style="width:70px;float:right;padding: 5px;margin-right:-6px;" id="deploy-continue">Continue</button>
				</div>
			</body>
			<script src=${scriptUri}></script>
			<link rel="stylesheet" href=${cssUri}>
			</html>`;
}
function deactivate() {
    if (tmpDirectory && fs.existsSync(tmpDirectory)) {
        try {
            fs.rmSync(tmpDirectory, { recursive: true, force: true });
        }
        catch (err) {
        }
    }
}
//# sourceMappingURL=extension.js.map