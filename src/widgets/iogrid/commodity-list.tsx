import * as React from "react";

import { Indicator, Sector } from "../../webapi";
import { Config } from "../../widget";
import { IOGrid } from "./iogrid";
import { ifNone, isNotNone, TMap } from "../../util/util";
import { Checkbox, Grid, IconButton, Menu, MenuItem, Slider, TextField, Tooltip, Typography } from "@material-ui/core";

import * as strings from "../../util/strings";
import { ColDef, DataGrid, PageChangeParams } from "@material-ui/data-grid";
import { Sort } from "@material-ui/icons";

/**
 * The row type of the commodity list.
 */
type Commodity = {
    id: string,
    index: number,
    name: string,
    code: string,
    selected: boolean,
    value: number,
};

type SortByType =
    "alphabetical"
    | "selection"
    | "indicator";

/**
 * Creates the list with the commodities for which the inputs and outputs
 * should be computed.
 */
export const CommodityList = (props: {
    config: Config,
    sectors: Sector[],
    indicators: Indicator[],
    widget: IOGrid,
}) => {

    // collect the selected sectors and their
    // scaling factors from the configuration
    // and store them in a map:
    // sector code -> factor
    const selection: TMap<number> = {};
    if (props.config.sectors) {
        props.config.sectors.reduce((numMap, code) => {
            const parts = code.split(':');
            if (parts.length < 2) {
                numMap[code] = 100;
            } else {
                numMap[parts[0]] = parseInt(parts[1]);
            }
            return numMap;
        }, selection);
    }

    // fire a change in the sector selection
    // based on the current selection state
    const fireSelectionChange = () => {
        const sectors = Object.keys(selection).map(
            code => code
                ? `${code}:${selection[code]}`
                : null)
            .filter(s => s ? true : false);
        props.widget.fireChange({ sectors });
    };

    // initialize the states
    const [searchTerm, setSearchTerm] = React.useState<string>("");
    const [menuElem, setMenuElem] = React.useState<null | HTMLElement>(null);
    const [indicator, setIndicator] = React.useState<null | Indicator>(null);
    const emptySelection = Object.keys(selection).length === 0;
    const [sortBy, setSortBy] = React.useState<SortByType>(
        emptySelection ? "alphabetical" : "selection");

    // map the sectors to commodity objects
    let commodities: Commodity[] = props.sectors.map(s => {
        return {
            id: s.id,
            index: s.index,
            name: s.name,
            code: s.code,
            selected: selection[s.code] ? true : false,
            value: ifNone(selection[s.code], 100),
        };
    });
    sortCommodities(commodities, {
        by: sortBy,
        values: sortBy === "indicator" && indicator
            ? props.widget.getIndicatorResults(indicator)
            : undefined,
    });

    if (strings.isNotEmpty(searchTerm)) {
        commodities = commodities.filter(
            c => strings.search(c.name, searchTerm) !== -1);
    }

    // create the column definitions of the data grid.
    const columns: ColDef[] = [
        {
            // the check box with click handler
            field: "selected",
            width: 50,
            renderCell: (params) => {
                const commodity = params.data as Commodity;
                return <Checkbox
                    checked={commodity.selected}
                    onClick={() => {
                        if (commodity.selected) {
                            delete selection[commodity.code];
                        } else {
                            selection[commodity.code] = 100;
                        }
                        fireSelectionChange();
                    }} />;
            }
        },
        {
            // sector name
            field: "name",
            headerName: "Sector",
            width: 300,
        },
        {
            // the slider for the scaling factor
            field: "value",
            headerName: " ",
            width: 100,
            renderCell: (params) => {
                const commodity = params.data as Commodity;
                return (
                    <Slider
                        value={commodity.value}
                        disabled={!commodity.selected}
                        onChange={(_, value) => {
                            selection[commodity.code] = value as number;
                            fireSelectionChange();
                        }}
                        min={0}
                        max={500}
                        ValueLabelComponent={SliderTooltip} />
                );
            }
        }
    ];

    const onPageChange = (p: PageChangeParams) => {
        props.widget.fireChange({
            page: p.page,
            count: p.pageSize
        });
    };

    return (
        <Grid container direction="column" spacing={2}>
            <Grid item>
                <Typography variant="h6" component="span">
                    Commodities
            </Typography>
            </Grid>
            <Grid item>
                <div style={{ display: "flex" }}>
                    <TextField
                        placeholder="Search"
                        style={{ width: "100%" }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)} />
                    <IconButton
                        aria-label="Sort by..."
                        aria-controls="commodity-sort-menu"
                        aria-haspopup="true"
                        onClick={e => setMenuElem(e.currentTarget)}>
                        <Sort />
                    </IconButton>
                    <Menu
                        id="commodity-sort-menu"
                        anchorEl={menuElem}
                        keepMounted
                        open={menuElem ? true : false}
                        onClose={() => setMenuElem(null)}
                        PaperProps={{
                            style: {
                                maxHeight: 48 * 4.5,
                            },
                        }}>
                        <CommoditySortMenu
                            withSelection={!emptySelection}
                            indicators={
                                filterIndicators(props.indicators, props.config)
                            }
                            setIndicator={setIndicator}
                            setMenuElem={setMenuElem}
                            setSortBy={setSortBy} />
                    </Menu>
                </div>
            </Grid>
            <Grid item style={{ width: "100%", height: 600 }}>
                <DataGrid
                    columns={columns}
                    rows={commodities}
                    pageSize={ifNone(props.config.count, 10)}
                    page={ifNone(props.config.page, 1)}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageChange}
                    rowsPerPageOptions={[10, 20, 30, 50, 100]}
                    hideFooterSelectedRowCount
                    hideFooterRowCount
                    headerHeight={0} />
            </Grid>
        </Grid>
    );
};

/**
 * A custom tooltip for the slider values.
 */
const SliderTooltip = (props: {
    children: React.ReactElement,
    open: boolean,
    value: number,
}) => {
    const { children, open, value } = props;
    return (
        <Tooltip
            open={open}
            enterTouchDelay={0}
            placement="top"
            title={value + "%"}>
            {children}
        </Tooltip>
    );
};

const CommoditySortMenu = (props: {
    withSelection: boolean,
    indicators: Indicator[],
    setMenuElem: (elem: null | HTMLElement) => void,
    setSortBy: (sorter: SortByType) => void,
    setIndicator: (indicator: Indicator) => void
}) => {

    const items: JSX.Element[] = [];

    if (props.withSelection) {
        // sort by selection
        items.push(
            <MenuItem onClick={() => {
                props.setMenuElem(null); // close
                props.setSortBy("selection");
                props.setIndicator(null);
            }}>
                Selected First
            </MenuItem>
        );
    }

    // alphabetical sorting
    items.push(
        <MenuItem onClick={() => {
            props.setMenuElem(null); // close
            props.setSortBy("alphabetical");
            props.setIndicator(null);
        }}>
            Alphabetical
        </MenuItem>
    );

    // sort items for the indicators
    for (const indicator of props.indicators) {
        items.push(
            <MenuItem onClick={() => {
                props.setMenuElem(null); // close
                props.setSortBy("indicator");
                props.setIndicator(indicator);
            }}>
                By {indicator.simplename || indicator.name}
            </MenuItem>
        );
    }

    return <>{items}</>;
};

const sortCommodities = (commodities: Commodity[], config: {
    by: SortByType,
    values?: number[]
}) => {
    return commodities.sort((c1, c2) => {

        // selected items first
        if (config.by === "selection" && c1.selected !== c2.selected) {
            return c1.selected ? -1 : 1;
        }

        // larger indicator contributions first
        if (config.by === "indicator" && config.values) {
            const val1 = config.values[c1.index];
            const val2 = config.values[c2.index];
            if (val1 !== val2) {
                return val2 - val1;
            }
        }

        // sort alphabetically by default
        return strings.compare(c1.name, c2.name);
    });
};

/**
 * Sort the indicators for the `sort-by` menu. We also filter the indicators
 * when a possible indicator filter is set in the configuration here.
 */
const filterIndicators = (indicators: Indicator[], config: Config): Indicator[] => {
    if (!indicators) {
        return [];
    }
    const codes = config?.indicators;
    const filtered = !codes
        ? indicators.slice(0)
        : indicators.filter(i => strings.eq(i.code, ...codes));
    if (!filtered) {
        return [];
    }

    // it was specified, that these indicators should be always
    // at the top of the list ...
    const predef: TMap<number> = {
        "Jobs Supported": 1,
        "Value Added": 2,
        "Energy Use": 3,
        "Land Use": 4,
        "Water Use": 5,
    };

    return filtered.sort((i1, i2) => {
        const name1 = i1.simplename || i1.name;
        const name2 = i2.simplename || i2.name;
        const c1 = predef[name1];
        const c2 = predef[name2];
        if (isNotNone(c1) && isNotNone(c2)) {
            return c1 - c2;
        }
        if (isNotNone(c1)) {
            return -1;
        }
        if (isNotNone(c2)) {
            return 1;
        }
        return strings.compare(name1, name2);
    });
};