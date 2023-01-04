import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getImageSize } from 'react-image-size'
import { Modal, ToggleButton, ToggleButtonGroup } from 'react-bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css';
import $ from "jquery"
import moment from 'moment'
import numeral from 'numeral'
import * as Diff from 'diff';
import Plot from 'react-plotly.js';

var key = null;
var state_clicked = false;
var canvas;
// greyed out fill context
var xctx;
// redline highlight context
var ctx;
var scale = 1;
var selector_data;
var orig_img_w;
var orig_img_h;
var showModal;

function resetUserScale()
{
    var appliedScale = 1 - Math.random()*0.01;
    $('meta[name="viewport"]').attr('content', "width=device-width, initial-scale=" + appliedScale);
}

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
    ctx.fillStyle = 'rgba(205,0,0,0.35)';
    for (var xpath in selector_data['xpath']) {
        var sel = selector_data['xpath'][xpath];
        var intersected = 
            (y > sel.top * scale && y < sel.top * scale + sel.height * scale) 
            && 
            (x > sel.left * scale && x < sel.left * scale + sel.width * scale);
        var lessSquare = sel.width * sel.height < min_square;
        if (intersected && lessSquare) {
            hoveredElementXpath = xpath;
            min_square = sel.width * sel.height;
        }
    }

    return hoveredElementXpath;
}

function drawSelectedXpath(hoveredXpath)
{
    var element = hoveredXpath ? selector_data['xpath'][hoveredXpath] : null;

    if(element) {
        ctx.strokeRect(
            element.left * scale, element.top * scale, 
            element.width * scale, element.height * scale
            );
        ctx.fillRect(
            element.left * scale, element.top * scale, 
            element.width * scale, element.height * scale
            );
    }  
}

function onCanvasMove(e)
{
    if (state_clicked) {
        return;
    }

    clearSelection();
    drawSelectedXpath(findHoveredXpath(e));
}

function setGraphType(data, isNumeral)
{
    data.x = isNumeral ? data.x_numeral : data.x_changes
    data.y = isNumeral ? data.y_numeral : data.y_changes
    data.text = isNumeral ? data.labels_numeral : data.labels_changes
    data.is_numeral = isNumeral
    return data
}

function showDataGraph(data)
{
    var chartDataNumeral = {};
    var chartDataTextual = {};
    var parsedDigitsCount = 0;
    for(var ts in data) {
        var contents = data[ts];
        // ignore unsuccessful snapshots
        if(contents == null){
            continue;
        }
        var dateTime = moment.unix(parseInt(ts)).format("DD/MM/YY HH:mm");
        var yNumeral = numeral(contents).value();
        // consider number parsing succesfull only if readable digit extracted
        if(yNumeral != null && yNumeral != Infinity && !isNaN(yNumeral)){
            parsedDigitsCount += 1;
        }
        chartDataNumeral[dateTime] = yNumeral || 0;
        chartDataTextual[dateTime] = contents;
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
        var diff = Diff.diffLines(prevText, newText);
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

    var chartData = {
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
    showModal(setGraphType(chartData, isDigitalGraph))
}


function onCanvasClicked(e) 
{
    if (state_clicked) {
        clearSelection();
        return;
    }

    var hoveredXpath = findHoveredXpath(e);
    if(!hoveredXpath) {
        console.log("No element found under mouse click coordinates");
        return;
    }

    drawSelectedXpath(hoveredXpath);

    var sel = selector_data['xpath'][hoveredXpath];
    xctx.fillStyle = 'rgba(205,205,205,0.95)';
    xctx.strokeStyle = 'rgba(225,0,0,0.9)';
    xctx.lineWidth = 3;
    xctx.fillRect(0, 0, canvas.width, canvas.height);
    // Clear out what only should be seen (make a clear/clean spot)
    xctx.clearRect(sel.left * scale, sel.top * scale, sel.width * scale, sel.height * scale);
    xctx.strokeRect(sel.left * scale, sel.top * scale, sel.width * scale, sel.height * scale);
    state_clicked = true;

    $.get({
        url: "/history",
        data: {
            "key": key,
            "xpath": hoveredXpath
        }
    }).done(function (data) {
        showDataGraph(data);
    });
}

function resizeView() 
{
    var selector_image = document.getElementById("canvas");
    var selector_image_rect = selector_image.getBoundingClientRect();
    var canvasWidth = selector_image_rect.width;
    scale = canvasWidth / selector_data['browser_width'];

    // make the canvas the same size as the image 
    // required to set in pixels - otherwise canvas will have strange scale on drawing
    $('#canvas').attr('height', orig_img_h * scale);
    $('#canvas').attr('width', canvasWidth);

    ctx.strokeStyle = 'rgba(255,0,0, 0.9)';
    ctx.fillStyle = 'rgba(255,0,0, 0.1)';
    ctx.lineWidth = 3;
    console.log("onResize | scaling set: " + scale);
}

function clearSelection()
{
    state_clicked = false;
    xctx.clearRect(0, 0, canvas.width, canvas.height);
}

function initView() 
{
    $(window).resize(function () {
        clearSelection();
        resizeView();
    });

    resizeView();
    $('#canvas').bind('mousemove', onCanvasMove);
    $('#canvas').bind('click', onCanvasClicked);
}

const loadXpath = () => {  
    fetch("/xpath?key="+key).then(res => res.json()).then((xpath) => {
        console.log("Reported browser width from backend: " + xpath['browser_width']);
        selector_data = xpath;
        initView();
    });
}

const onPictureLoaded = (width, height) => {
    console.log("Loaded background");
    orig_img_w = width
    orig_img_h = height
    canvas = document.getElementById("canvas")
    xctx = canvas.getContext("2d");
    ctx = canvas.getContext("2d");
    loadXpath();
}

const ChangesTableRow = ({change}) => {
    return (
        <tr>
            <td key="1">{change.time}</td>
            <td key="2">
                {
                    change.diff.map((diff, index) => {
                        var styles = {"color": diff.changed ? (diff.added ? "green":"red") : "black"}
                        return (<span key={index} style={styles}>{diff.value}</span>)
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
                { changes.map((change) => <ChangesTableRow key={change.time} change={change} />) }
            </tbody>
        </table>
    )
}

const Graph = ({data}) => {
    return (
      <Plot
        data={data}
        useResizeHandler={true}
        style={{width: "100%", height: "80%"}}
      />
    );
}

const ModalWindow = () => {
    const [fullscreen, setFullscreen] = useState(true);
    const [show, setShow] = useState(false);
    const [graphData, setGraphData] = useState({})

    showModal = (graphData) => {
        const values = [true, 'sm-down', 'md-down', 'lg-down', 'xl-down', 'xxl-down'];
        setGraphData(graphData);
        setFullscreen(true);
        setShow(true);
    }

    var switchGraph = (isNumeral) => {
        setGraphData(graphData => ({...setGraphType(graphData, isNumeral)}))
    }

    return (
        <Modal show={show} fullscreen={fullscreen} onHide={() => setShow(false)} onShow={resetUserScale}>
            <Modal.Header closeButton>
                <Modal.Title>{graphData.is_numeral ? "Tendency" : "Changes"}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ToggleButtonGroup type="radio" name="options" value={graphData.is_numeral ? 2 : 1}>
                    <ToggleButton value={1} onClick={() => switchGraph(false)}>As changes</ToggleButton>
                    <ToggleButton value={2} onClick={() => switchGraph(true)}>As tendency</ToggleButton>
                </ToggleButtonGroup>
                <Graph data={[graphData]} />
                {!graphData.is_numeral && <ChangesTable changes={graphData.changes} />}
            </Modal.Body>
        </Modal>
    );
}

const Canvas = () => {
    key = useParams().key;
    var src = "/static/snapshots/" + key + "/screenshot.jpg";
    // call after component loaded
    useEffect(() => {
        getImageSize(src).then(({ width, height }) => {
            console.log("Image size: " + width + ":" + height)
            onPictureLoaded(width, height);
        });
    });
    var styles = {
        "width": "100%",
        "background": "url("+src+")",
        "backgroundSize": "cover",
        "backgroundRepeat": "no-repeat"
    };
    return (
        <div className="ui container">
            <ModalWindow />
            <canvas id="canvas" style={styles}></canvas>
        </div>
    )
}

export default Canvas;