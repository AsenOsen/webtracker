// @file Scrape the page looking for elements of concern (%ELEMENTS%)
// http://matatk.agrip.org.uk/tests/position-and-width/
// https://stackoverflow.com/questions/26813480/when-is-element-getboundingclientrect-guaranteed-to-be-updated-accurate
//
// Some pages like https://www.londonstockexchange.com/stock/NCCL/ncondezi-energy-limited/analysis
// will automatically force a scroll somewhere, so include the position offset
// Lets hope the position doesnt change while we iterate the bbox's, but this is better than nothing

var ELEMENTS = 'div,span,form,table,tbody,tr,td,a,p,ul,li,h1,h2,h3,h4,header,footer,section,article,aside,details,main,nav,section,summary,strong,dd,dt,dl,input,nobr';

// Include the getXpath script directly, easier than fetching
function getxpath(e) {
        var n = e;
        //if (n && n.id) return '//*[@id="' + n.id + '"]';
        for (var o = []; n && Node.ELEMENT_NODE === n.nodeType;) {
            for (var i = 0, r = !1, d = n.previousSibling; d;) d.nodeType !== Node.DOCUMENT_TYPE_NODE && d.nodeName === n.nodeName && i++, d = d.previousSibling;
            for (d = n.nextSibling; d;) {
                if (d.nodeName === n.nodeName) {
                    r = !0;
                    break
                }
                d = d.nextSibling
            }
            o.push((n.prefix ? n.prefix + ":" : "") + n.localName + ("[" + (i + 1) + "]")), n = n.parentNode
        }
        return o.length ? "/" + o.reverse().join("/") : ""
    }

const findUpTag = (el) => {
    let r = el
    chained_css = [];
    depth = 0;

    //  Strategy 1: If it's an input, with name, and there's only one, prefer that
    if (el.name !== undefined && el.name.length) {
        var proposed = el.tagName + "[name=" + el.name + "]";
        var proposed_element = window.document.querySelectorAll(proposed);
        if(proposed_element.length) {
            if (proposed_element.length === 1) {
                return proposed;
            } else {
                // Some sites change ID but name= stays the same, we can hit it if we know the index
                // Find all the elements that match and work out the input[n]
                var n=Array.from(proposed_element).indexOf(el);
                // Return a Playwright selector for nthinput[name=zipcode]
                return proposed+" >> nth="+n;
            }
        }
    }

    // Strategy 2: Keep going up until we hit an ID tag, imagine it's like  #list-widget div h4
    while (r.parentNode) {
        if (depth == 5) {
            break;
        }
        /*if ('' !== r.id) {
            chained_css.unshift("#" + CSS.escape(r.id));
            final_selector = chained_css.join(' > ');
            // Be sure theres only one, some sites have multiples of the same ID tag :-(
            if (window.document.querySelectorAll(final_selector).length == 1) {
                return final_selector;
            }
            return null;
        } else {*/
            chained_css.unshift(r.tagName.toLowerCase());
        /*}*/
        r = r.parentNode;
        depth += 1;
    }
    return null;
}

function xpath_start() {
    var root = document.documentElement || document.body;
    var scroll_y =+ root.scrollTop
    // @todo - if it's SVG or IMG, go into image diff mode
    // %ELEMENTS% replaced at injection time because different interfaces use it with different settings
    var elements = window.document.querySelectorAll(ELEMENTS);
    var size_pos = {};
    var geometryFingerprint = '';
    // after page fetch, inject this JS
    // build a map of all elements and their positions (maybe that only include text?)
    var bbox;
    for (var i = 0; i < elements.length; i++) {
        bbox = elements[i].getBoundingClientRect();

        // Exclude items that are not interactable or visible
        if(elements[i].style.opacity === "0") {
            continue
        }
        if(elements[i].style.display === "none" || elements[i].style.pointerEvents === "none" ) {
            continue
        }

        // Forget really small ones
        if (bbox['width'] < 10 && bbox['height'] < 10) {
            continue;
        }

        // Don't include elements that are offset from canvas
        if (bbox['top']+scroll_y < 0 || bbox['left'] < 0) {
            continue;
        }

        // @todo the getXpath kind of sucks, it doesnt know when there is for example just one ID sometimes
        // it should not traverse when we know we can anchor off just an ID one level up etc..
        // maybe, get current class or id, keep traversing up looking for only class or id until there is just one match

        // 1st primitive - if it has class, try joining it all and select, if theres only one.. well thats us.
        xpath_result = false;

        try {
            var d = findUpTag(elements[i]);
            if (d) {
                xpath_result = d;
            }
        } catch (e) {
            console.log(e);
        }

        // You could swap it and default to getXpath and then try the smarter one
        // default back to the less intelligent one
        if (!xpath_result) {
            try {
                // I've seen on FB and eBay that this doesnt work
                // ReferenceError: getXPath is not defined at eval (eval at evaluate (:152:29), <anonymous>:67:20) at UtilityScript.evaluate (<anonymous>:159:18) at UtilityScript.<anonymous> (<anonymous>:1:44)
                xpath_result = getxpath(elements[i]);
            } catch (e) {
                console.log(e);
                continue;
            }
        }

        if (window.getComputedStyle(elements[i]).visibility === "hidden") {
            continue;
        }

        // @todo Possible to ONLY list where it's clickable to save JSON xfer size
        var w = Math.round(bbox['width']);
        var h = Math.round(bbox['height']);
        var l = Math.floor(bbox['left']);
        var t = Math.floor(bbox['top'])+scroll_y;
        size_pos[xpath_result] = {
            width: w,
            height: h,
            left: l,
            top: t,
            text: elements[i].innerText || elements[i].value
        };
        // TODO: also we could add "text" into fingerprint, but it requires to determine first what is better:
        // wait for dynamic content (more frequent case therefore can be endless) or wait for dynamic geometry (less frequent case) 
        geometryFingerprint += xpath_result+":"+w+":"+h+":"+l+":"+t+";";

    }

    // Window.width required for proper scaling in the frontend
    return {'xpath': size_pos, 'fingerprint':geometryFingerprint, 'browser_width': window.innerWidth};
}

return xpath_start();