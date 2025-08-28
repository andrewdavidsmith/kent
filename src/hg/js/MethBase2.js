$(function() {
    const JQUERY_URL = "https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js";
    const DATATABLES_URL = "https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js";
    const DT_SELECT_URL = "https://cdn.datatables.net/select/1.7.0/js/dataTables.select.min.js";
    const REMOTE_CSS_URLS = [
        "https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css", // datatable css
        "https://cdn.datatables.net/select/1.7.0/css/select.dataTables.min.css", // dt select css
    ];
    const MAX_CHECKBOX_ELEMENTS = 20;  // max checkboxes to show in groupings on the lhs of the page
    const COLOR_ATTRIBUTE = "group";

    // --- CSS Styles ---
    const INLINE_CSS = `
    #container {
        display: flex;
        width: 100%;
        gap: 1em;
        align-items: flex-start;
        box-sizing: border-box;
    }
    #filters {
        display: flex;
        flex-direction: column;
        gap: 1em;
        width: 300px;
        flex-shrink: 0;
        /* ADS: the lines below are for vertical scrolling if needed */
        /* max-height: 80vh; */
        /* overflow-y: auto; */
        align-self: stretch;
        box-sizing: border-box;
        padding-right: 0.5em;
    }
    #filters > div {
        display: flex;
        flex-direction: column;
        gap: 0.3em;
        margin-bottom: 1em;
    }
    #filters > div > strong {
        margin-bottom: 0.25em;
        font-weight: bold;
    }
    #filters label {
        display: flex;
        align-items: center;
        gap: 0.3em;
        cursor: pointer;
        user-select: none;
    }
    #theDataTable_wrapper {
        flex: 1 1 auto;
        min-width: 0;
        box-sizing: border-box;
    }
    #theDataTable {
        width: 100% !important;
        box-sizing: border-box;
    }
    #theDataTable td:nth-child(n+2),
    #theDataTable th:nth-child(n+2) {
        vertical-align: top;
        /* white-space: nowrap; */
        /* overflow: hidden;          /* hide overflow */
        min-width: 100px; /* Adjust width as needed */
    }
    #theDataTable .select-checkbox {
        width: 1em !important;   /* force narrow width */
    }
    #theDataTable input.row-select {
        /* additional checkbox styling */
    }
    table.dataTable {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
    }
    table.dataTable tbody tr:nth-child(odd) {
        background-color: #f0f0f0;
    }
    table.dataTable tbody tr:nth-child(even) {
        background-color: #ffffff;
    }
    table.dataTable tbody tr:hover {
        background-color: #d3eaff; /* Light blue on hover */
    }
    .color-box {
        display: inline-block;
        width: 1em;
        height: 1em;
        vertical-align: middle;
        /* background-color set dynamically in JS */
    }
    `;

    function toTitleCase(str) {
        return str
            .toLowerCase()
            .split(/[_\s-]+/) // Split on underscore, space, or hyphen
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '); // or ' ' or '' depending on desired format
    }

    const excludedFromCheckboxes = new Set([
        "accession",
    ]);

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const hgsid = urlParams.get("hgsid");
    const db = urlParams.get("db");
    const [id, sessionKey] = hgsid.split('_');

    function addSafeSessionParam(sessionDbContents) {
        const paramsForUpdate = new URLSearchParams({
            "hgsid": hgsid,
            "action": "update",
            "contents": sessionDbContents,
        });
        fetch('/cgi-bin/MethBase2', {
            "method": 'POST',
            "headers": {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            "body": paramsForUpdate.toString(),
        }).then(() => {
            const paramsForReturnToBrowser = new URLSearchParams({
                "hgsid": hgsid,
                "g": 'MethBase2',
            });
            fetch('/cgi-bin/hgTrackUi', {
                "method": 'POST',
                "headers": {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                "body": paramsForReturnToBrowser.toString(),
            });
        });
    }

    // Inject inline CSS
    document.head.appendChild(
        Object.assign(document.createElement("style"), {
            textContent: INLINE_CSS,
        })
    );

    // Load remote CSS
    for (const href of REMOTE_CSS_URLS) {
        document.head.appendChild(Object.assign(document.createElement("link"), {
            rel: "stylesheet",
            href,
        }));
    }

    /* ADS: Uncomment the lines below to ask the user on leaving page or refresh */
    // window.addEventListener('beforeunload', function (e) {
    //     e.preventDefault(); // some browsers need this?
    //     e.returnValue = '';
    // });

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    function initHTML() {
        // Add container
        const container = document.createElement("div");
        container.id = "myTag";  // need to have some named scope here
        // style below is set to match UCSC vis control
        container.innerHTML = `
        <label for="modeSwitcher" style="display: inline-block; width: 110px; margin-bottom: 1em;">
            <b>Data&nbsp;type:&nbsp;</b>
        </label>
        <select class='normalText visDD' style='width: 70px' id="modeSwitcher">
            <option value="hmr">hmr</option>
            <option value="levels">levels</option>
            <option value="both">both</option>
        </select>
        <div id="container">
            <div id="filters"></div>
            <table id="theDataTable">
                <thead></thead>
                <tfoot></tfoot>
            </table>
        </div>
        `;
        // Instead of appending to body, append into the placeholder div
        const placeholder = document.getElementById('MethBase2-placeholder');
        if (placeholder) {
            placeholder.appendChild(container);
        } else {
            // fallback if placeholder not found
            document.body.appendChild(container);
        }
    }

    function initTableAndFilters(allData) {
        let { MethBase2: data, Colors: colorMap, Index: accToRowId } = allData;
        if (!data.length) return;

        hgcentralUri = new URLSearchParams(allData["sessionDb.contents"]);

        // identify the previously selected accessions and which data
        // type had been turned on
        const selectedAccessions = new Set();
        const accessionRegex = /^[DES]RX\d+_(hmr|levels)_sel$/;
        var modeInit = "";
        for (const [key, value] of hgcentralUri) {
            if (accessionRegex.test(key) && value != "0") {
                const [accession, dataType] = key.split('_');
                selectedAccessions.add(accession);
                const expected = dataType === "hmr" ? "hmr" : "levels";
                modeInit = (modeInit === "" || modeInit === expected) ? expected : "both";
            }
        }

        document.getElementById('modeSwitcher').value =
            modeInit !== "" ? modeInit : "hmr";

        const possibleValues = {};
        data.forEach(entry => {
            for (const [key, val] of Object.entries(entry)) {
                if (!possibleValues[key]) possibleValues[key] = new Map();
                const map = possibleValues[key];
                map.set(val, (map.get(val) || 0) + 1);
            }
        });

        const sortedPossibleValues = {};
        Object.entries(possibleValues).forEach(([key, valMap]) => {
            const arr = Array.from(valMap.entries());
            arr.sort((a, b) => b[1] - a[1]);
            sortedPossibleValues[key] = arr;
        });

        const orderedColumnNames = Object.keys(possibleValues);
        const dynamicColumns = orderedColumnNames.map(key => ({
            data: key,
            title: toTitleCase(key),
        }));

        const checkboxColumn = {
            data: null,
            orderable: false,
            className: 'select-checkbox',
            defaultContent: '',
            title: `
            <label title="Select all visible rows" style="cursor:pointer; user-select:none;">
            <input type="checkbox" id="select-all" /></label>
            `,
            // no render function needed
        };

        const columns = [checkboxColumn, ...dynamicColumns];
        const table = $('#theDataTable').DataTable({
            data: data,
            deferRender: true,
            columns: columns,
            responsive: true,
            // autoWidth: true,   // Helps columns shrink to fit content
            order: [[1, 'asc']],  // sort by the first real data column, not checkbox
            pageLength: 50,       // show 50 rows per page instead of the default 10
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
            select: {
                style: 'multi',
                selector: 'td:first-child'
            },
            initComplete: function() {
                // Check all appropriate checkboxes in amortized constant time per
                const api = this.api();
                selectedAccessions.forEach(accession => {
                    const rowIndex = accToRowId[accession];
                    if (rowIndex !== undefined) {
                        api.row(rowIndex).select();
                    }
                });
            },
            drawCallback: function() {  // Reset header "select all" checkbox
                $('#select-all')
                    .prop('checked', false)
                    .prop('indeterminate', false);
            },
        });

        const thead = document.querySelector('#theDataTable thead');
        const row = thead.insertRow();

        columns.forEach((col, index) => {
            const cell = row.insertCell();
            if (col.className === 'select-checkbox') {
                const label = document.createElement('label');
                label.style.cursor = 'pointer';
                label.style.userSelect = 'none';
                label.title = 'Show only selected rows';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.selectFilter = 'true';
                checkbox.style.cursor = 'pointer';
                label.appendChild(checkbox);
                cell.appendChild(label);
                return;
            }
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Search...';
            input.style.width = '100%';
            cell.appendChild(input);
        });

        $('#theDataTable thead input[type="text"]').on('keyup change', function () {
            const colIndex = $(this).parent().index();
            table.column(colIndex).search(this.value).draw();
        });

        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
            const filterInput = document.querySelector('input[data-select-filter]');
            const onlySelected = filterInput?.checked;

            // If checkbox is not checked, show all rows
            if (!onlySelected) return true;

            // Otherwise, only show selected rows
            const row = table.row(dataIndex);
            return row.select && row.selected();
        });

        $('#theDataTable thead input[data-select-filter]').on('change', function () {
            table.draw();
        });

        $('#theDataTable thead').on('click', '#select-all', function () {
            const isChecked = this.checked;
            if (isChecked) {
                table.rows({ page: 'current' }).select();
            } else {
                table.rows({ page: 'current' }).deselect();
            }
        });

        const filtersDiv = document.getElementById("filters");

        const checkboxGroupIndexes = [];

        orderedColumnNames.forEach((key, colIdx) => {
            // no checkboxes for excluded keys
            if (excludedFromCheckboxes.has(key)) return;

            const groupDiv = document.createElement("div");
            groupDiv.dataset.colidx = colIdx;  // store the column index here

            // Add the heading and the filtered checkboxes
            // (only top MAX_CHECKBOX_ELEMENTS)
            const heading = document.createElement("strong");
            heading.textContent = toTitleCase(key);
            groupDiv.appendChild(heading);

            // Keep only the most abundant top MAX_CHECKBOX_ELEMENTS entries
            let topToShow = sortedPossibleValues[key]
                .filter(([val, _]) => val.trim().toUpperCase() !== 'NA')
                .slice(0, MAX_CHECKBOX_ELEMENTS);
            // If there is an "other" entry, put it at the end
            let otherKey = null;
            let otherValue = null;
            topToShow = topToShow.filter(([val, value]) => {
                if (val.toLowerCase() === "other") {
                    otherKey = val;
                    otherValue = value;
                    return false;
                }
                return true;
            });
            if (otherValue !== null) {
                topToShow.push([otherKey, otherValue]);
            }

            topToShow.forEach(([val, count]) => {
                const label = document.createElement("label");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = escapeRegex(val);
                label.appendChild(checkbox);
                if (key === COLOR_ATTRIBUTE) {
                    const colorBox = document.createElement("span");
                    colorBox.classList.add("color-box");
                    colorBox.style.backgroundColor = colorMap[val];  // dynamic color
                    label.appendChild(colorBox);
                }
                label.appendChild(document.createTextNode(`${val} (${count})`));
                groupDiv.appendChild(label);
            });

            filtersDiv.appendChild(groupDiv);
            checkboxGroupIndexes.push(colIdx);
        });

        checkboxGroupIndexes.forEach((colIdx, idx) => {
            const groupDiv = filtersDiv.children[idx];
            const checkboxes = [...groupDiv.querySelectorAll('input[type=checkbox]')];
            // --- add a set of checkboxes for this group ---
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const checked = checkboxes.filter(c => c.checked).map(c => c.value);
                    const searchStr = checked.length ? '^(' + checked.join('|') + ')$' : '';
                    table.column(colIdx + 1).search(searchStr, true, false).draw();
                });
            });
            // --- add 'clear' button ---
            const clearBtn = document.createElement("button");
            clearBtn.textContent = "Clear";
            clearBtn.type = "button"; // prevent form submission if inside a form
            clearBtn.addEventListener("click", () => {
                // Uncheck all checkboxes
                checkboxes.forEach(cb => cb.checked = false);
                // Recalculate the (now empty) string term and update table
                table.column(colIdx + 1).search('', true, false).draw();
            });
            // Prepend the 'clear' button
            groupDiv.insertBefore(clearBtn, groupDiv.children[1] || null);
        });

        document.getElementById('Submit').addEventListener('click', (e) => {
            const selectedData = table.rows({ selected: true }).data().toArray();
            const accessionRegex = /^[DES]RX\d+_(hmr|levels)_sel$/
            for (const [key, value] of [...hgcentralUri]) {
                const [prefix] = key.split('_');
                if (accessionRegex.test(key) && !selectedData.includes(prefix)) {
                    hgcentralUri.delete(key);
                }
            }
            const mode = document.getElementById("modeSwitcher").value;
            for (const obj of selectedData) {
                if (mode === "hmr") {
                    hgcentralUri.set(obj.accession + '_hmr_sel', "1");
                } else if (mode === "levels") {
                    hgcentralUri.set(obj.accession + '_levels_sel', "1");
                } else if (mode === "both") {
                    hgcentralUri.set(obj.accession + '_hmr_sel', "1");
                    hgcentralUri.set(obj.accession + '_levels_sel', "1");
                }
            }
            addSafeSessionParam(hgcentralUri);
        });
    }

    function loadDataAndInit() {
        const CACHE_KEY = 'MethBaseMetaData';
        const CACHE_TIMESTAMP_KEY = 'MethBaseMetaDataTimestamp';
        const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

        const now = Date.now();
        const cachedTimestamp = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY), 10);

        let cachedData = null;
        let useCache = false;

        if (cachedTimestamp && (now - cachedTimestamp < CACHE_EXPIRY_MS)) {
            const cachedStr = localStorage.getItem(CACHE_KEY);
            cachedData = cachedStr ? JSON.parse(cachedStr) : null;
            useCache = !!cachedData;
        }

        const params = new URLSearchParams({
            "hgsid": hgsid,
            "db": db,
            // ADS: uncomment below for gzip delivery
            // "gzip": "1",
            "action": "metadata",
            "refresh": useCache ? "0" : "1",
        });

        const request = new Request('/cgi-bin/MethBase2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        fetch(request)
            .then(res => res.json())
            .then(newData => {
                let mergedData;
                if (useCache) {
                    mergedData = {...newData, ...cachedData};
                } else {
                    const idToIndexMap = {};
                    newData["MethBase2"].forEach((row, index) => {
                        idToIndexMap[row.accession] = index;
                    });
                    mergedData = newData;
                    mergedData["Index"] = idToIndexMap;
                    // Save the merged data to cache
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        "MethBase2": newData["MethBase2"],
                        "Colors": newData["Colors"],
                        "Index": idToIndexMap,
                    }));
                    localStorage.setItem(CACHE_TIMESTAMP_KEY, now.toString());
                }
                initTableAndFilters(mergedData);
            });
    }

    function whenReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback);
        } else {
            callback();
        }
    }

    function loadIfMissing(condition, url, callback) {
        if (condition) {
            const s = document.createElement("script");
            s.src = url;
            s.onload = callback;
            document.head.appendChild(s);
        } else {
            callback();
        }
    }

    loadIfMissing(typeof jQuery === "undefined", JQUERY_URL, () => {
        loadIfMissing(typeof jQuery.fn.DataTable === "undefined", DATATABLES_URL, () => {
            loadIfMissing(typeof jQuery.fn.dataTable?.select === "undefined", DT_SELECT_URL, () => {
                whenReady(() => {
                    initHTML();
                    loadDataAndInit();
                });
            });
        });
    });
});
