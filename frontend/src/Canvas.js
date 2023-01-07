import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getImageSize } from 'react-image-size'
import { Modal, ToggleButton, ToggleButtonGroup } from 'react-bootstrap'
import { browserHistory } from 'react-router'
import 'bootstrap/dist/css/bootstrap.min.css';
import $ from "jquery"
import moment from 'moment'
import numeral from 'numeral'
import * as Diff from 'diff';
import Plot from 'react-plotly.js';

var key = null;
// reset every time when react component loaded
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
var clickedXpath = null;

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
    var currentContents = null
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
    showModal(setGraphType(chartData, isDigitalGraph))
}

function onCanvasMove(e)
{
    if (state_clicked) {
        return;
    }

    clearSelection();
    drawSelectedXpath(findHoveredXpath(e));
}

function drawClickedXpath(hoveredXpath)
{
    if(hoveredXpath) {
        drawSelectedXpath(hoveredXpath);
        var sel = selector_data['xpath'][hoveredXpath];
        xctx.fillStyle = 'rgba(205,205,205,0.95)';
        xctx.strokeStyle = 'rgba(225,0,0,0.9)';
        xctx.lineWidth = 1;
        xctx.fillRect(0, 0, canvas.width, canvas.height);
        // Clear out what only should be seen (make a clear/clean spot)
        xctx.clearRect(sel.left * scale, sel.top * scale, sel.width * scale, sel.height * scale);
        xctx.strokeRect(sel.left * scale, sel.top * scale, sel.width * scale, sel.height * scale);
        state_clicked = true;
    }
}

function onCanvasClicked(e) 
{
    if (state_clicked) {
        clearSelection();
        clickedXpath = null
        return;
    }

    var hoveredXpath = findHoveredXpath(e);
    if(!hoveredXpath) {
        console.log("No element found under mouse click coordinates");
        return;
    }

    clickedXpath = hoveredXpath
    drawClickedXpath(hoveredXpath)

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
    var canvasWidth = canvas.getBoundingClientRect().width;
    scale = canvasWidth / selector_data['browser_width'];

    // make the canvas the same size as the image 
    // required to set in pixels - otherwise canvas will have strange scale on drawing
    $(canvas).attr('height', orig_img_h * scale);
    $(canvas).attr('width', canvasWidth);

    ctx.strokeStyle = 'rgba(255,0,0, 0.9)';
    ctx.fillStyle = 'rgba(255,0,0, 0.1)';
    ctx.lineWidth = 1;
}

function clearSelection()
{
    state_clicked = false;
    xctx.clearRect(0, 0, canvas.width, canvas.height);
}

const onPictureLoaded = (width, height) => {
    orig_img_w = width
    orig_img_h = height
    canvas = document.getElementById("canvas")
    xctx = canvas.getContext("2d");
    ctx = canvas.getContext("2d");

    $(window).resize(function () {
        clearSelection();
        resizeView();
        drawClickedXpath(clickedXpath)
    });

    resizeView();
    $(canvas).bind('mousemove', onCanvasMove);
    $(canvas).bind('click', onCanvasClicked);
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

const Canvas = () => {
    const [styles, setStyles] = useState({})
    const [snapshotExists, setSnapshotExists] = useState(true);
    key = useParams().key;
    state_clicked = false
    // call after component loaded
    useEffect(() => {
        fetch("/latest/"+key).then(res => res.json()).then((latest) => {
            if (!latest.xpath || !latest.img){
                setSnapshotExists(false)
            } else {
                selector_data = latest.xpath;
                setStyles(styles => ({...CanvasStyles(latest.img)}))
                getImageSize(latest.img).then(({ width, height }) => {
                    onPictureLoaded(width, height);
                });
            }
        });
    }, []);
    return (
        <div className="ui container">
            <ModalWindow />
            {!snapshotExists && (
                <div className="ui active dimmer">
                    <div class="ui massive text loader">Wait some time, page will be available soon.</div>
                </div>
            )}
            {snapshotExists && <canvas id="canvas" style={styles}></canvas>}
        </div>
    )
}

export default Canvas;