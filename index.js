// GLOBAL VARIABLES
var X = [];
var NODES = [];
var LINKS = [];
var FEATURES = [];
var MALLEABLE = [];
var LINKS_MALLEABLE = [];
var TRAIT_GROUPS = [];
var TRAIT_GROUP_MAP = {};
var SIMULATION = null;
var LINK_DIST = null;
var LINK = null;
const TOOLTIP = d3.select("#tooltip-display");
const EPS = 1e-3;
const DIST_MUL = 1.5;
const FMT3 = d3.format(".3f");
const FMT0 = d3.format(".0f");

// HELPER FUNCTIONS
const srcName = (s) => (s && typeof s === "object") ? s.scientific_name : s;

const isMalleableLink = (d) => srcName(d.source) === "malleable";

const keyFn = (d) => `${srcName(d.source)}--${srcName(d.target)}`;

const snakeToTitle = (text) => {
    /** Converts snake text like "ab_cd_ef" 
     *  into title format like "Ab Cd Ef".
     *  
     *  Arguments:
     *  text {str} -- Snake format text.
     * 
     *  Returns:
     *  {str} -- Title format text.
    */
    return text.split('_').map(word => (
        word.charAt(0).toUpperCase() + 
        word.slice(1).toLowerCase()
    )).join(' ');
}

const euclideanDistance = (a, b) => {
    /** Computes Euclidean distance between 2 vectors.
     * 
     * Arguments:
     * a {array} -- Vector 1.
     * b {array} -- Vector 2.
     * 
     * Returns:
     * d {float} -- Euclidean distance.
     */
    if (a.length !== b.length) {
        throw new Error("Vectors must be the same length");
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

const initPrototypeLinks = () => {
    /** Computes links between prototype nodes. */
    LINKS = [];
    for (let i = 0; i < X.length; i++) {
        const source = NODES[i].scientific_name;
        const a = X[i];
        for (let j = i + 1; j < X.length; j++) {
            const target = NODES[j].scientific_name;
            const b = X[j];
            const value = euclideanDistance(a, b);
            LINKS.push({
                "source": source,
                "target": target,
                "value": value
            })
        }
    }
}

const forceDistPlot = () => {
    /** Plots prototypes on a force simulation. */

    // Specify SVG width and height.
    const width = 0.7 * window.innerWidth;
    const height = 0.85 * window.innerHeight;

    // Select SVG.
    const svg = d3.select("#plot-main")
        .selectAll("svg")
        .data([null])
        .join("svg")
        .attr("width", width)
        .attr("height", height);

    // The force simulation mutates links and nodes, so create a copy
    // so that re-evaluating this cell produces the same result.
    const links = LINKS.map(d => ({...d})).concat(
        LINKS_MALLEABLE.map(d => ({...d})))
    const nodes = NODES.map(d => ({...d}));

    // Specify link distance scale.
    LINK_DIST = d3.scaleLinear()
        .domain(d3.extent(links, d => d.value))
        .range([0, 200]); // allow 0 → can sit exactly on top

    // Create a simulation with several forces.
    SIMULATION = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.scientific_name)
            .distance(d => LINK_DIST(d.value * DIST_MUL))
            .strength(d => (
                // Strong when matching, decent otherwise.
                isMalleableLink(d) ? 
                (d.value < EPS ? 1.0 : 0.25) : 0.1  
            ))
        )
        .force("center", d3.forceCenter(width / 2, height / 2));

    // Add a line for each link, and a circle for each node.
    const minLink = d3.min(
        links.filter(l => isMalleableLink(l)),
        l => l.value
    );
    LINK = svg.selectAll(".gLinks")
        .data([null])
        .join("g")
        .attr("class", "gLinks")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", d => isMalleableLink(d) ? "malleable-link" : null)
        .attr("stroke", d => d.value === minLink ? "red" : "#ccc")
        .attr("stroke-opacity", d => isMalleableLink(d) ? 1 : 0.2)
        .attr("stroke-width", d => isMalleableLink(d) ? "5px" : "1px")
        .on("mouseover", (e, d) => {
            const x = ((
                e.target.x1.baseVal.value + 
                e.target.x2.baseVal.value
            )) / 2
            const y = ((
                e.target.y1.baseVal.value + 
                e.target.y2.baseVal.value
            )) / 2
            if (isMalleableLink(d)) {
                TOOLTIP.select("text")
                    .text(FMT3(d.value))
                TOOLTIP.select("rect")
                    .attr("width", "50px")
                TOOLTIP.attr("opacity", 1)
                    .attr("transform", `translate(${x}, ${y-20})`)
                    .raise()
            } 
        })
        .on("mouseout", () => {
            d3.select("#tooltip-display")
                .attr("opacity", 0)
        })

    const node = svg.selectAll(".gImages")
        .data([null])
        .join("g")
        .attr("class", "gImages")
        .selectAll("image")
        .data(nodes)
        .join("image")
        .attr("class", "node")
        .attr("xlink:href", d => d.image)
        .attr("width", 80)
        .attr("height", 80)
        .on("mouseover", (e, d) => {
            const name_len = d.scientific_name.length
            if (d.scientific_name != "malleable") {
                TOOLTIP.select("text")
                    .text(d.scientific_name)
                TOOLTIP.select("rect")
                    .attr("width", `${name_len*10}px`)
                TOOLTIP.attr("opacity", 1)
                    .attr("transform", 
                        `translate(${d.x - name_len*4}, ${d.y - 50})`)
                    .raise()
            } 
        }).on("mouseout", () => {
            TOOLTIP.attr("opacity", 0);
        })

    // Add mouseover and click behaviors.
    node.on("dblclick", (e, d) => {
        // Set Malleable to be equal
        // to the clicked prototype's value,
        // or the mean of all prototypes. 
        if (d.scientific_name != "malleable") {
            MALLEABLE = [...X[d.index]];
        } else {
            setMeanMalleable();
        }
        updateLinkDistances();
        refreshControlsFromMalleable();
    });
    
    // Add a drag behavior.
    node.call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // Set the position attributes of links and nodes each time the simulation ticks.
    SIMULATION.on("tick", () => {
        LINK.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node.attr("x", d => d.x - 50) // -50 to center image on node.
            .attr("y", d => d.y - 50);
    });

    function dragstarted(event) {
        /** Reheat the simulation when drag starts, 
         *  and fix the subject position. */
        if (!event.active) SIMULATION.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        /** Update the subject (dragged node) position during drag. */
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        /** Restore the target alpha so the simulation 
         *  cools after dragging ends. Unfix the subject 
         *  position now that it’s no longer being dragged. */
        if (!event.active) SIMULATION.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }
}

const updateLinkDistances = () => {
    /** Update link distances and change in force distance graph. */
    
    // Recompute malleable links.
    computeMalleableLinks();

    // Rebuild links array.
    const links = LINKS.map(d => ({ ...d })).concat(
        LINKS_MALLEABLE.map(d => ({ ...d })));

    // Update distance scale domain to new values.
    LINK_DIST.domain(d3.extent(links, d => d.value));

    // Update link selections.
    const minLink = d3.min(
        links.filter(l => isMalleableLink(l)),
        l => l.value
    );
    LINK = LINK.data(links, keyFn)
        .join("line")
        .attr("class", d => isMalleableLink(d) ? "malleable-link" : null)
        .attr("stroke", d => d.value === minLink ? "red" : "#ccc")
        .attr("stroke-opacity", d => isMalleableLink(d) ? 1 : 0.2)
        .attr("stroke-width", d => isMalleableLink(d) ? 5 : 1)
        .on("mouseover", (e, d) => {
            const x = ((
                e.target.x1.baseVal.value + 
                e.target.x2.baseVal.value
            )) / 2
            const y = ((
                e.target.y1.baseVal.value + 
                e.target.y2.baseVal.value
            )) / 2
            if (isMalleableLink(d)) {
                TOOLTIP.select("text")
                    .text(FMT3(d.value))
                TOOLTIP.select("rect")
                    .attr("width", "50px")
                TOOLTIP.attr("opacity", 1)
                    .attr("transform", `translate(${x}, ${y-20})`)
                    .raise()
            } 
        }).on("mouseout", () => {
            d3.select("#tooltip-display")
                .attr("opacity", 0)
        });

    // Feed new links to the force and update distance accessor
    SIMULATION.force("link")
        .links(links)
        .distance(d => LINK_DIST(d.value * DIST_MUL))
        .strength(d => (
            isMalleableLink(d) ? 
            (d.value < EPS ? 1.0 : 0.25) : 0.1
        ));

    // reheat so nodes settle to new link lengths
    SIMULATION.alpha(0.8).restart();
}

const computeMalleableLinks = () => {
    /** Computes links from malleable point to all others. */

    LINKS_MALLEABLE = []; // Reset
    // Add Euclidean distances from malleable 
    // to all other nodes to the list of links.
    for (let i = 0; i < NODES.length-1; i++) {
        LINKS_MALLEABLE.push({
            "source": "malleable",
            "target": NODES[i].scientific_name,
            "value": euclideanDistance(MALLEABLE, X[i])
        })
    }
}

const setMeanMalleable = () => {
    /** Sets malleable as mean of all prototypes. */
    MALLEABLE = X[0].map(() => 0);
    X.forEach(v => {
        for (let i = 0; i < v.length; i++) {
            MALLEABLE[i] = MALLEABLE[i] + v[i];
        }
    })
    MALLEABLE = MALLEABLE.map(v => v/X.length);
}

const initMalleable = () => {
    /** Computes and adds malleable point. */
    setMeanMalleable();
    
    // Add malleable to the list of nodes.
    NODES.push({
        "scientific_name": "malleable",
        "group": "malleable",
        "image": "https://i.postimg.cc/s2dngpxD/malleable.png"
    })

    computeMalleableLinks(); 
}

const refreshControlsFromMalleable = () => {
    // Update all sliders
    d3.selectAll('#control-panel input[type="range"]')
        .each(function() {
            const idx = +this.dataset.idx;
            const v = MALLEABLE[idx];
            d3.select(this).property("value", v);

            // Update the label in the same controller.
            const p = d3.select(this.parentNode).select("p.value-label");
            const traitName = p.text().split(":")[0]; // keep the original trait text
            p.text(`${traitName}: ${FMT3(v)}`);
        });

    // Update all checkboxes (both single switch and multi).
    d3.selectAll('#control-panel input[type="checkbox"]')
        .each(function() {
            const idx = +this.dataset.idx;
            const checked = Number(FMT0(MALLEABLE[idx])) === 1;
            d3.select(this).property("checked", checked);
        });
}

function groupFeatures(features) {
    /** Converts features from format
     *  [{  "idx": int, 
     *      "feature": str, 
     *      "type": str, 
     *      "trait": str, 
     *      "label": str, 
     *      "group": "str"}, ...]
     *  
     *  to format
     * 
     *  {   group: [
     *      {   "trait": str,
     *          "type": str,
     *          "options": [
     *              {   "idx": int,
     *                  "feature": str,
     *                  "label": str
     *              }, ...]
     *      }, ...], 
     * ...}
     */
    const groups = new Map();

    for (const { idx, feature, type, trait, label, group } of features) {
        const gKey = group ?? ""; // guard against undefined
        if (!groups.has(gKey)) groups.set(gKey, new Map());

        const traitsMap = groups.get(gKey);
        const tKey = `${trait}||${type}`; // compound key to keep type with trait
        if (!traitsMap.has(tKey)) {
        traitsMap.set(tKey, { trait, type, options: [] });
        }

        traitsMap.get(tKey).options.push({ idx, feature, label });
    }

    // Convert Maps to plain object structure
    const out = {};
    for (const [gKey, traitsMap] of groups.entries()) {
        out[gKey] = Array.from(traitsMap.values());
    }
    return out;
}

const processFeatures = (featureCols) => {
    /** Processes feature columns to get them in
     *  the desired format.
     * 
     * Arguments:
     * featureCols {array} -- List of feature column names.
     */
    const features = [];
    for (let i = 0; i < featureCols.length; i++) {
        const feature = featureCols[i];
        const featureSplit = feature.split("-");
        const featureType = (
            feature.startsWith("is_") ? 
            "cb" : (featureSplit.length == 1) ? 
            "r" : "cmm"
        );
        const trait = snakeToTitle(
            featureType == "r" ? 
            feature : featureSplit[0]
        );
        const label = (
            featureType == "cmm" ? 
            snakeToTitle(featureSplit[1]) : 
            featureType == "cb" ? trait.slice(3) : 
            trait
        )
        const group = TRAIT_GROUP_MAP[feature]
        features.push({
            "idx": i,
            "feature": feature,
            "type": featureType,
            "trait": trait,
            "label": label,
            "group": group
        });
    }

    // Sort by group.
    FEATURES = groupFeatures(features);
}

const processCSV = (data) => {
    /** Transforms data into the right format. 
     * 
     * Arguments:
     * data {array} -- CSV data.
    */
    const xStartIdx = 4;

    // Extract features names, types and indices.
    processFeatures(Object.keys(data[0]).slice(xStartIdx));

    // Extract feature data and store as graph Nodes.
    data.forEach(d_cluster => {
        X.push(Object.values(d_cluster).slice(xStartIdx));
        NODES.push({
            "scientific_name": d_cluster.scientific_name,
            "common_name": d_cluster.common_name,
            "group": "prototype",
            "image": d_cluster.image
        });
    });
    
    // Create links between nodes.
    initPrototypeLinks();
}

const addSlider = (idx, feature, trait, group) => {
    /** Adds controller for type 'r' features. 
     * 
     * Arguments:
     * idx {int} -- Index of feature column in X.
     * feature {str} -- Original name of the feature column.
     * trait {str} -- Trait label.
     * group {str} -- Trait group.
    */

    // Get value and round to 3 decimal places.
    const fmt = d3.format(".3f");
    let value = MALLEABLE[idx];

    // Add div for this controller inside 
    // controller group div.
    const controllerDiv = d3.select(`#control-group-${group}`)
        .selectAll(`.controller-${feature}`)
        .data([null])
        .join("div")
        .attr("class", "controller-div")
        .attr("id", `controller-${feature}`);

    // Slider label.
    const label = controllerDiv
        .selectAll("p.value-label")
        .data([null])
        .join("p")
        .attr("class", "value-label")
        .text(`${trait}: ${fmt(value)}`);

    // Slider.
    controllerDiv
        .selectAll("input")
        .data([null])
        .join("input")
        .attr("type", "range")
        .attr("min", 0)
        .attr("max", 1)
        .attr("step", 0.001)
        .style("width", "100%")
        .attr("data-idx", idx)
        .property("value", value)
        .on("input", function (event) {
            const v = +event.target.value;
            MALLEABLE[idx] = v; // Keep data in sync.
            label.text(`${trait}: ${fmt(v)}`);
        });
}

const addSwitch = (group, idx, feature, label) => {
    /** Adds a radio button for single yes/no selections. */
    
    // Define formatter that rounds to 0 decimal points.
    const fmt = d3.format(".0f");
    
    // Add div for this controller inside 
    // controller group div.
    const controllerDiv = d3.select(`#control-group-${group}`)
        .selectAll(`.controller-${feature}`)
        .data([null])
        .join("div")
        .attr("class", "controller-div")
        .attr("id", `controller-${feature}`);

    // Label.
    controllerDiv.selectAll("span")
        .data([null])
        .join("span")
        .style("margin-right", "10px")
        .html(`${label}:`);

    // Check box.
    controllerDiv
        .selectAll("input")
        .data([null])
        .join("input")
        .attr("type", "checkbox")
        .attr("name", feature)
        .attr("value", feature)
        .attr("data-idx", idx)              // ← add this
        .property("checked", Number(fmt(MALLEABLE[idx])) === 1)
        .on("change", (e) => { 
            MALLEABLE[idx] = 1 - Number(fmt(MALLEABLE[idx]));
        });
}

const addMultiSelector = (group, trait, options) => {
    /** Adds ability to select multiple options. */

    // Define formatter that rounds to 0 decimal points.
    const fmt = d3.format(".0f");
    
    // Add div for this controller inside 
    // controller group div.
    const controllerDiv = d3.select(`#control-group-${group}`)
        .selectAll(`.controller-${trait}`)
        .data([null])
        .join("div")
        .attr("class", "controller-div")
        .attr("id", `controller-${trait}`);
    
    // Add trait label.
    controllerDiv.selectAll(".trait-header")
        .data([null])
        .join("p")
        .attr("class", "trait-header")
        .html(`${trait}:`)

    // Add checkbox for each option.
    const gOptions = controllerDiv.selectAll(".gOptions")
        .data([null])
        .join("g")
        .attr("class", "gOptions");

    // Option div.
    const optionDivs = gOptions.selectAll(".option-div")
        .data(options)
        .join("div")
        .attr("class", ".option-div")
        .style("text-align", "left");

    optionDivs.selectAll("input")
        .data(d => [d])
        .join("input")
        .attr("type", "checkbox")
        .attr("id", d => `option-${d.feature}`)
        .attr("name", d => d.feature)
        .attr("value", d => d.feature)
        .attr("data-idx", d => d.idx)
        .style("margin-right", "10px")
        .property("checked", d => Number(fmt(MALLEABLE[d.idx])) === 1)
        .on("change", (e, d) => {
            MALLEABLE[d.idx] = 1 - Number(fmt(MALLEABLE[d.idx]));
        });

    // Add labels.
    optionDivs.selectAll("span")
        .data(d => [d])
        .join("span")
        .attr("margin-right", "10px")
        .html(d => `${d.label}`);
}

const addApplyButton = () => {
    /** Adds an apply button which when pressed,
     *  triggers re-rendering of the dashboard.
     */
    d3.select("#control-panel")
        .selectAll("#button-apply")
        .data([null])
        .join("button")
        .attr("id", "button-apply")
        .text("APPLY")
        .style("padding", "10px 0px")
        .on("click", (e) => {
            updateLinkDistances();
        });
}

const listenKeyPress = () => {
    /** Listens for keypress and sets
     *  malleable and controls to all 0s
     *  if 0 was pressed and all 1s if 1 was
     *  pressed.
     */

    d3.select("body").on("keydown", (e) => {
        if (e.key === "0" || e.key === "1") {
            const val = e.key === "0" ? 0.0 : 1.0;
            MALLEABLE = MALLEABLE.map(d => val);
            updateLinkDistances();
            refreshControlsFromMalleable();
        }
    });
}

const addControls = () => {
    /** Add controls to the control panel. */

    // Get control panel.
    const controlPanel = d3.select("#control-panel")
        .style("max-height", `${window.innerHeight}px`)
        .style("overflow-y", "scroll");
    
    const control_group = controlPanel.selectAll(".control-group")
        .data(Object.entries(FEATURES))
        .join("div")
        .attr('class', "control-group")
        .attr('id', d => `control-group-${d[0]}`);
    control_group.append("hr")
        .style("margin", "10px");
    control_group.append("p")
        .html(d => snakeToTitle(d[0]))
        .style("font-weight", 900);
    
    Object.entries(FEATURES).forEach(d_group => {
        const group = d_group[0];
        const traits = d_group[1];
        traits.forEach(d_trait => {
            if (d_trait.type == "r") {
                addSlider(
                    d_trait.options[0].idx,
                    d_trait.options[0].feature,
                    d_trait.trait,
                    group
                )
            } else if (d_trait.type == "cb") {
                addSwitch(
                    group,
                    d_trait.options[0].idx,
                    d_trait.options[0].feature,
                    d_trait.options[0].label
                )
            } else {
               addMultiSelector(
                    group,
                    d_trait.trait,
                    d_trait.options
               )
            }
        })
    })

    // Add option to min / max controls.
    listenKeyPress();
}

// LOAD DATA
d3.json("data/plant_trait_groups.json").then((data) => {
    TRAIT_GROUP_MAP = data;
    TRAIT_GROUPS = [... new Set(Object.values(TRAIT_GROUP_MAP))];
}).catch((error) => {
    console.error("Error loading JSON:", error);
});

d3.csv('data/prototype_cluster_medoids.csv', d3.autoType).then(data => {
    // PROCESS DATA
    processCSV(data);

    // ADD MALLEABLE POINT.
    initMalleable();

    // PLOT FORCE DISTANCE PLOT
    forceDistPlot();

    // ADD APPLY BUTTON
    addApplyButton();

    // ADD CONTROLS.
    addControls();
    
}).catch((error) => {
    console.error("Error loading CSV:", error);
});