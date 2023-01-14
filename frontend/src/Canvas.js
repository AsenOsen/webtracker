import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getImageSize } from 'react-image-size'
import { Modal, ToggleButton, ToggleButtonGroup, Button } from 'react-bootstrap'
import { browserHistory } from 'react-router'
import Plot from 'react-plotly.js';
import QuickPinchZoom, { make3dTransformValue } from "react-quick-pinch-zoom";
import { ToastContainer, toast } from 'react-toastify';
import $ from "jquery"
import moment from 'moment'
import numeral from 'numeral'
import axios from 'axios'
import * as Diff from 'diff';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';

var gSnapshotKey = null;
var gStateClicked = false;
var gCanvas;
var gGrayCtx;
var gRedCtx;
var gScale = 1;
var gSelectorXpath;
var gOrigImgWidth;
var gOrigImgHeight;
var gShowModalFunc;
var gSnapshotOffset;
var gClickedXpath = null;


function findHoveredXpath(e)
{
     // Add in offset
    /*if ((typeof e.offsetX === "undefined" || typeof e.offsetY === "undefined") || (e.offsetX === 0 && e.offsetY === 0)) {
        var targetOffset = $(e.target).offset();
        e.offsetX = e.pageX - targetOffset.left;
        e.offsetY = e.pageY - targetOffset.top;
    }*/

    var x = e.offsetX;
    var y = e.offsetY;

    // the smallest possible square
    var hoveredElementXpath = null;
    var min_square = Infinity;
    gRedCtx.fillStyle = 'rgba(205,0,0,0.35)';
    for (var xpath in gSelectorXpath['xpath']) {
        var sel = gSelectorXpath['xpath'][xpath];
        var intersected = 
            (y > sel.t * gScale && y < sel.t * gScale + sel.h * gScale) 
            && 
            (x > sel.l * gScale && x < sel.l * gScale + sel.w * gScale);
        var lessSquare = sel.w * sel.h < min_square;
        if (intersected && lessSquare) {
            hoveredElementXpath = xpath;
            min_square = sel.w * sel.h;
        }
    }

    return hoveredElementXpath;
}

function drawSelectedXpath(hoveredXpath)
{
    var element = hoveredXpath ? gSelectorXpath['xpath'][hoveredXpath] : null;

    if(element) {
        gRedCtx.strokeRect(
            element.l * gScale, element.t * gScale, 
            element.w * gScale, element.h * gScale
            );
        gRedCtx.fillRect(
            element.l * gScale, element.t * gScale, 
            element.w * gScale, element.h * gScale
            );
    }  
}

function setGraphType(data, isNumeral)
{
    data.x = isNumeral ? data.x_numeral : data.x_changes
    data.y = isNumeral ? data.y_numeral : data.y_changes
    data.text = isNumeral ? data.labels_numeral : data.labels_changes
    data.is_numeral = isNumeral
    return data
}

function tsPrintf(ts)
{
    return moment.unix(parseInt(ts)).format("DD/MM/YY HH:mm")
}

function showDataGraph(data)
{
    var chartDataNumeral = {};
    var chartDataTextual = {};
    var parsedDigitsCount = 0;
    var currentContents = null
    for(var ts in data) {
        var contents = data[ts];
        // ignore unsuccessful snapshots
        if(contents == null){
            continue;
        }
        // cut seconds
        var dateTime = tsPrintf(ts)
        var yNumeral = numeral(contents).value();
        // consider number parsing succesfull only if readable digit extracted
        if(yNumeral != null && yNumeral != Infinity && !isNaN(yNumeral)){
            parsedDigitsCount += 1;
        }
        chartDataNumeral[dateTime] = yNumeral || 0;
        chartDataTextual[dateTime] = contents;
        currentContents = contents
    }

    // TODO: algorithm of determining whether graph should be digital or textual
    // can be better: if numeral`ed digit is not substr`ed within contents
    // maybe it is better to build graph as changes graph (requires research) 
    var digitPercentage = parsedDigitsCount / Object.keys(chartDataNumeral).length;
    var isDigitalGraph = digitPercentage >= 0.5

    var changesCounter = 0;
    var prevText = null;   
    var chartDataChanges = {};  
    var changes = []   
    for(var key in chartDataTextual) {
        var newText = chartDataTextual[key];
        if(newText != prevText && prevText != null) {
            changesCounter += 1;
        }
        chartDataChanges[key] = changesCounter
        newText = newText||"";
        if (prevText == null){
            prevText = newText;
        }
        var diff = Diff.diffTrimmedLines(prevText, newText);
        prevText = newText;        

        var changed = false;
        var diffObj = []
        diff.forEach((part) => {
            diffObj.push({
                changed: part.added || part.removed,
                added: part.added,
                value: part.value
            })
            changed |= (part.added || part.removed);
        });

        if(changed) {
            changes.push({time:key, diff:diffObj})
        }
    }

    if (currentContents) {
        var title = currentContents.substr(0,50)
        title = '"' + (title + (currentContents.length > title.length ? '...' : '')) + '"'
    } else {
        title = null
    }

    var chartData = {
        titleText: title,
        x_numeral: Object.keys(chartDataNumeral),
        y_numeral: Object.values(chartDataNumeral),
        x_changes: Object.keys(chartDataChanges),
        y_changes: Object.values(chartDataChanges),
        changes: changes,
        is_numeral: null,
        labels_numeral: Object.values(chartDataNumeral).map(x => String(x).substr(0,50)),
        labels_changes: Object.values(chartDataTextual).map(x => String(x).substr(0,50)),
        type: 'line'
    }

    //console.log(chartData);
    gShowModalFunc(setGraphType(chartData, isDigitalGraph))
}

function onCanvasMove(e)
{ 
    if (gStateClicked) {
        return;
    }

    clearSelection();
    drawSelectedXpath(findHoveredXpath(e.nativeEvent));
}

function drawClickedXpath(hoveredXpath)
{
    if(hoveredXpath) {
        drawSelectedXpath(hoveredXpath);
        var sel = gSelectorXpath['xpath'][hoveredXpath];
        gGrayCtx.fillStyle = 'rgba(205,205,205,0.95)';
        gGrayCtx.strokeStyle = 'rgba(225,0,0,0.9)';
        gGrayCtx.lineWidth = 1;
        gGrayCtx.fillRect(0, 0, gCanvas.width, gCanvas.height);
        // Clear out what only should be seen (make a clear/clean spot)
        gGrayCtx.clearRect(sel.l * gScale, sel.t * gScale, sel.w * gScale, sel.h * gScale);
        gGrayCtx.strokeRect(sel.l * gScale, sel.t * gScale, sel.w * gScale, sel.h * gScale);
        gStateClicked = true;
    }
}

function onCanvasClicked(e) 
{
    if (gStateClicked) {
        clearSelection();
        gClickedXpath = null
        clearToasts()
        return;
    }

    var hoveredXpath = findHoveredXpath(e.nativeEvent);
    if(!hoveredXpath) {
        console.log("No element found under mouse click coordinates");
        return;
    }

    gClickedXpath = hoveredXpath
    drawClickedXpath(hoveredXpath)
    showOpenModalToast()
}

function clearToasts()
{
    toast.dismiss()
}

function showOpenModalToast()
{
    clearToasts()
    toast(<Toast />, {autoClose: false});
}

function openModalFromToast() 
{
    $.get({
        url: "/history",
        data: {
            "key": gSnapshotKey,
            "xpath": gClickedXpath
        }
    }).done(function (data) {
        showDataGraph(data);
    });
}

function resizeView() 
{
    // parent because outer component for pinch zoom used - actual boundings belongs to him
    var canvasWidth = gCanvas.parentElement.getBoundingClientRect().width;
    gScale = canvasWidth / gSelectorXpath['browser_width'];

    // make the canvas the same size as the image 
    // required to set in pixels - otherwise canvas will have strange scale on drawing
    $(gCanvas).attr('height', gOrigImgHeight * gScale);
    $(gCanvas).attr('width', canvasWidth);

    gRedCtx.strokeStyle = 'rgba(255,0,0, 0.9)';
    gRedCtx.fillStyle = 'rgba(255,0,0, 0.1)';
    gRedCtx.lineWidth = 1;
}

function clearSelection()
{
    gStateClicked = false;
    gGrayCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);
}

const onPictureLoaded = (width, height) => {
    gOrigImgWidth = width
    gOrigImgHeight = height
    gGrayCtx = gCanvas.getContext("2d");
    gRedCtx = gCanvas.getContext("2d");

    $(window).resize(function () {
        clearSelection();
        resizeView();
        drawClickedXpath(gClickedXpath)
    });

    resizeView();
}

const ChangesTableRow = ({change}) => {
    var structed = []
    change.diff.map((diff, index) => {
        if (diff.changed) {
            var field = diff.added ? 'added':'deleted';
            if (structed.length == 0) {
                var obj = {}; obj[field] = diff.value
                structed.push(obj)
            } else {
                if(!structed[structed.length-1][field]) {
                    structed[structed.length-1][field] = diff.value
                } else {
                    var obj = {}; obj[field] = diff.value
                    structed.push(obj)
                }
            }
        } else {
            structed.push({'unchanged': diff.value})
            structed.push({})
        }
    })
    return (
        <tr>
            <td key="1" width="10%" className="ui message black">
                <div className="ui center aligned message black">{change.time}</div>
            </td>
            <td key="2" width="90%">
                {
                    structed.map((change, index) => {
                        if(Object.keys(change).length == 0) {
                            return null
                        }
                        if(change.unchanged) {
                            return (<div key={index}>{change.unchanged.trim()}</div>)
                        } else {
                            return (
                                <table key={index}>
                                    <tbody>
                                        <tr>
                                            <td key="1" className="error">
                                                {change.deleted && <div style={{"color":"red"}}>
                                                {change.deleted.split("\n").map((el, i) => <div key={i}>{el.trim()}</div>)}
                                                </div>}
                                            </td>
                                            <td key="2"> → </td>
                                            <td key="3" className="positive">
                                                {change.added && <div style={{"color":"green"}}>
                                                {change.added.split("\n").map((el, i) => <div key={i}>{el.trim()}</div>)}
                                                </div>}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            )
                        }
                    }
                )}
            </td>
        </tr>
    )
}

const ChangesTable = ({changes}) => {
    return (
        <table className="ui table" border="1">
            <tbody>
                { changes
                    .sort((a,b) => {return a.time < b.time ? 1 : -1})
                    .map((change) => <ChangesTableRow key={change.time} change={change} />) 
                }
            </tbody>
        </table>
    )
}

const Graph = ({data}) => {
    return (
      <Plot
        data={[data]}
        useResizeHandler={true}
        style={{
            width: "100%", height: "80%"
        }}
        layout={{
            margin: {
                l:50, r:50, t:0, pad:0
            },
            title: {
                text: data.titleText,
                font: {
                    size: 10
                },
                yanchor: 'top',
                y: 0.98
            }
        }}
      />
    );
}

const Toast = () => {
    return (
        <div className="d-grid gap-2">
            <Button onClick={openModalFromToast}>Explore this element 🚀</Button>
        </div>
    )
}

const ModalWindow = () => {
    const [fullscreen, setFullscreen] = useState(true);
    const [show, setShow] = useState(false);
    const [graphData, setGraphData] = useState({})

    gShowModalFunc = (graphData) => {
        const values = [true, 'sm-down', 'md-down', 'lg-down', 'xl-down', 'xxl-down'];
        setGraphData(graphData);
        setFullscreen(true);
        setShow(true);
    }

    var switchGraph = (isNumeral) => {
        setGraphData(graphData => ({...setGraphType(graphData, isNumeral)}))
    }

    return (
        <Modal show={show} fullscreen={fullscreen} onHide={() => setShow(false)}>
            <Modal.Header closeButton>
                <Modal.Title>
                    <ToggleButtonGroup type="radio" name="options" value={graphData.is_numeral ? 2 : 1}>
                        <ToggleButton value={1} onClick={() => switchGraph(false)}>Changes</ToggleButton>
                        <ToggleButton value={2} onClick={() => switchGraph(true)}>Tendency</ToggleButton>
                    </ToggleButtonGroup>
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Graph data={graphData} />
                {!graphData.is_numeral && <ChangesTable changes={graphData.changes} />}
            </Modal.Body>
        </Modal>
    );
}

const CanvasStyles = (url) => {
    return {
        "width": "100%",
        "backgroundImage": "url("+url+")",
        "backgroundSize": "cover",
        "backgroundRepeat": "no-repeat"
    }
}

const SnapshotLoadingScreen = () => {
    return (
        <div className="ui active dimmer">
            <div className="ui massive text loader">Wait some time, page will be available soon.</div>
        </div>
    )
}

const Canvas = () => {
    const [styles, setStyles] = useState({})
    const [snapshotExists, setSnapshotExists] = useState(true);
    const [snapshotTime, setSnapshotTime] = useState(0);
    const canvasRef = useRef();
    gSnapshotKey = useParams().key;

    const setupSnapshot = (snapshot) => {
        if (!snapshot.xpath || !snapshot.img){
            setSnapshotExists(false)
        } else {
            gSelectorXpath = snapshot.xpath;
            setSnapshotTime(snapshot.ts)
            setStyles(styles => ({...CanvasStyles(snapshot.img)}))
            getImageSize(snapshot.img).then(({ width, height }) => {
                onPictureLoaded(width, height);
            });
        }
    }

    const loadSnapshot = () => {
        axios.get("/snapshot/"+gSnapshotKey, {params: {offset: gSnapshotOffset}}).then((latest) => {
            setupSnapshot(latest.data)
        });
    }

    const previousSnapshot = () => {
        gSnapshotOffset++
        loadSnapshot()
    }

    const nextSnapshot = () => {
        gSnapshotOffset--
        loadSnapshot()
    }

    const onCanvasPinchZoom = useCallback(({ x, y, scale }) => {
        if (gCanvas) {
            const value = make3dTransformValue({ x, y, scale });
            gCanvas.style.setProperty("transform", value);
        }
    }, []);

    // called after component loaded
    useEffect(() => {
        // reset every time on component loads
        gStateClicked = false
        gSnapshotOffset = 0

        gCanvas = canvasRef.current
        loadSnapshot()
        console.log('loaded')
    }, []);

    return (
        <div className="ui container">
            {!snapshotExists && <SnapshotLoadingScreen />}
            {snapshotExists && (
                <div>
                    <table className="ui fluid table">
                        <tbody>
                            <tr>
                                <td><div className="d-grid gap-2"><Button onClick={previousSnapshot}>Prev</Button></div></td>
                                <td><div className="d-grid gap-2"><Button onClick={nextSnapshot}>Next</Button></div></td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="ui center aligned header">{tsPrintf(snapshotTime)}</div>
                    <QuickPinchZoom onUpdate={onCanvasPinchZoom}>
                        <canvas id="canvas" ref={canvasRef} style={styles} onMouseMove={onCanvasMove} onClick={onCanvasClicked}></canvas>
                    </QuickPinchZoom>
                    <ModalWindow />
                    <ToastContainer />
                </div>
            )}
        </div>
    )
}

export default Canvas;