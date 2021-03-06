import {
    Directive, Input, EventEmitter, SimpleChange, OnChanges, DoCheck, IterableDiffers,
    IterableDiffer, Output
} from "@angular/core";
import * as _ from "lodash";
import {ReplaySubject} from "rxjs";

export interface SortEvent {
    sortBy: string|string[];
    sortOrder: string
}

export interface PageEvent {
    activePage: number;
    rowsOnPage: number;
    dataLength: number;
}

type SortOrder = "asc"|"desc";

export interface ColumnParams<R> {
    name: string
    field: keyof R
    tooltip?: string
    valueHtml?: (r:R) => string
    valueTooltip?: (r:R) => string
}

export class Column<R extends object> {
    name: string;
    field: keyof R;
    tooltip: string;
    valueHtml(r: R): string { return r[this.field] ? r[this.field].toString() : ""; }
    valueTooltip(r: R): string | undefined { return undefined; }

    constructor(obj: ColumnParams<R>) {
        this.name = obj["name"];
        if (obj["field"]) this.field = obj["field"];
        if (obj["tooltip"]) this.tooltip = obj["tooltip"];
        if (obj["valueHtml"]) this.valueHtml = obj["valueHtml"];
        if (obj["valueTooltip"]) this.valueTooltip = obj["valueTooltip"];
    }
}

@Directive({
    selector: 'table[mfData]',
    exportAs: 'mfDataTable'
})
export class DataTable implements OnChanges, DoCheck {

    private diff: IterableDiffer<any>;
    @Input("mfData") public inputData: any[] = [];

    @Input("mfSortBy") public sortBy: string|string[] = "";
    @Input("mfSortOrder") public sortOrder: SortOrder = "asc";
    @Output("mfSortByChange") public sortByChange = new EventEmitter<string|string[]>();
    @Output("mfSortOrderChange") public sortOrderChange = new EventEmitter<string>();

    @Input("mfRowsOnPage") public rowsOnPage = 1000;
    @Input("mfActivePage") public activePage = 1;

    private mustRecalculateData = false;

    public data: any[];

    public onSortChange = new ReplaySubject<SortEvent>(1);
    public onPageChange = new EventEmitter<PageEvent>();

    public constructor(private differs: IterableDiffers) {
        this.diff = differs.find([]).create(null);
    }

    public getSort(): SortEvent {
        return {sortBy: this.sortBy, sortOrder: this.sortOrder};
    }

    public setSort(sortBy: string|string[], sortOrder: SortOrder): void {
        if (this.sortBy !== sortBy || this.sortOrder !== sortOrder) {
            this.sortBy = sortBy;
            this.sortOrder = _.includes(["asc","desc"], sortOrder) ? sortOrder : "asc";
            this.mustRecalculateData = true;
            this.onSortChange.next({sortBy: sortBy, sortOrder: sortOrder});
            this.sortByChange.emit(this.sortBy);
            this.sortOrderChange.emit(this.sortOrder);
        }
    }

    public getPage(): PageEvent {
        return {activePage: this.activePage, rowsOnPage: this.rowsOnPage, dataLength: this.inputData.length};
    }

    public setPage(activePage: number, rowsOnPage: number): void {
        if (this.rowsOnPage !== rowsOnPage || this.activePage !== activePage) {
            this.activePage = this.activePage !== activePage ? activePage : this.calculateNewActivePage(this.rowsOnPage, rowsOnPage);
            this.rowsOnPage = rowsOnPage;
            this.mustRecalculateData = true;
            this.onPageChange.emit({
                activePage: this.activePage,
                rowsOnPage: this.rowsOnPage,
                dataLength: this.inputData ? this.inputData.length : 0
            });
        }
    }

    private calculateNewActivePage(previousRowsOnPage: number, currentRowsOnPage: number): number {
        const firstRowOnPage = (this.activePage - 1) * previousRowsOnPage + 1;
        return Math.ceil(firstRowOnPage / currentRowsOnPage);
    }

    private recalculatePage() {
        let lastPage = Math.ceil(this.inputData.length / this.rowsOnPage);
        this.activePage = lastPage < this.activePage ? lastPage : this.activePage;
        this.activePage = this.activePage || 1;

        this.onPageChange.emit({
            activePage: this.activePage,
            rowsOnPage: this.rowsOnPage,
            dataLength: this.inputData.length
        });
    }

    public ngOnChanges(changes: {[key: string]: SimpleChange}): any {
        if (changes["rowsOnPage"]) {
            this.rowsOnPage = changes["rowsOnPage"].previousValue;
            this.setPage(this.activePage, changes["rowsOnPage"].currentValue);
            this.mustRecalculateData = true;
        }
        if (changes["sortBy"] || changes["sortOrder"]) {
            if (!_.includes(["asc", "desc"], this.sortOrder)) {
                console.warn("angular2-datatable: value for input mfSortOrder must be one of ['asc', 'desc'], but is:", this.sortOrder);
                this.sortOrder = "asc";
            }
            if (this.sortBy) {
                this.onSortChange.next({sortBy: this.sortBy, sortOrder: this.sortOrder});
            }
            this.mustRecalculateData = true;
        }
        if (changes["inputData"]) {
            this.inputData = changes["inputData"].currentValue || [];
            this.recalculatePage();
            this.mustRecalculateData = true;
        }
    }

    public ngDoCheck(): any {
        let changes = this.diff.diff(this.inputData);
        if (changes) {
            this.recalculatePage();
            this.mustRecalculateData = true;
        }
        if (this.mustRecalculateData) {
            this.fillData();
            this.mustRecalculateData = false;
        }
    }

    private fillData(): void {
        let offset = (this.activePage - 1) * this.rowsOnPage;
        let data = this.inputData;
        const sortBy = this.sortBy;
        if (typeof sortBy === 'string' || sortBy instanceof String) {
            data = _.orderBy(data, this.caseInsensitiveIteratee(<string>sortBy), [this.sortOrder]);
        } else {
            data = _.orderBy(data, sortBy, [this.sortOrder]);
        }
        data = _.slice(data, offset, offset + this.rowsOnPage);
        this.data = data;
    }

    private caseInsensitiveIteratee(sortBy: string) {
        return (row: any): any => {
            let value = row;
            for (let sortByProperty of sortBy.split('.')) {
                if (value) {
                    value = value[sortByProperty];
                }
            }
            if (value && typeof value === 'string' || value instanceof String) {
                return value.toLowerCase();
            }
            return value;
        };
    }
}
