import { Injectable, Injector } from '@angular/core';
import { Params } from '@angular/router';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';

import { of, combineLatest, defer, Observable } from 'rxjs';
import { map, switchMap, catchError, withLatestFrom, skipWhile, take, filter } from 'rxjs/operators';

import { AlertService } from '../../service/alert.service';

import { AppState } from '../';
import { StompState } from '../stomp/stomp.reducer';
import { CustomRouterState } from '../router/router.reducer';

import { AbstractSdrRepo } from '../../model/sdr/repo/abstract-sdr-repo';

import { SdrResource, SdrCollection, SdrFacet, SdrFacetEntry } from '../../model/sdr';
import { SidebarMenu, SidebarSection, SidebarItem } from '../../model/sidebar';
import { SdrRequest, Facetable, Indexable, Direction, Sort, Pageable } from '../../model/request';
import { OperationKey, FacetSort, Facet, DiscoveryView, DirectoryView } from '../../model/view';

import { injectable, repos } from '../../model/repos';

import { selectAllResources } from './';
import { selectRouterState } from '../router';
import { selectIsStompConnected, selectStompState } from '../stomp';

import * as fromDialog from '../dialog/dialog.actions';
import * as fromRouter from '../router/router.actions';
import * as fromStomp from '../stomp/stomp.actions';
import * as fromSdr from './sdr.actions';
import * as fromSidebar from '../sidebar/sidebar.actions';

@Injectable()
export class SdrEffects {

    private repos: Map<string, AbstractSdrRepo<SdrResource>>;

    constructor(
        private actions: Actions,
        private injector: Injector,
        private store: Store<AppState>,
        private alert: AlertService
    ) {
        this.repos = new Map<string, AbstractSdrRepo<SdrResource>>();
        this.injectRepos();
    }

    // TODO: alerts should be in dialog location if a dialog is opened

    @Effect() getAll = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.GET_ALL, ['directoryViews', 'discoveryViews'])),
        switchMap((action: fromSdr.GetAllResourcesAction) => this.getAllHandler(action.name))
    );

    @Effect({ dispatch: false }) getAllSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.GET_ALL_SUCCESS, ['directoryViews', 'discoveryViews'])),
        switchMap((action: fromSdr.GetAllResourcesSuccessAction) => this.waitForStompConnection(action.name)),
        withLatestFrom(this.store.pipe(select(selectStompState))),
        map(([combination, stomp]) => this.subscribeToResourceQueue(combination[0], stomp))
    );


    @Effect() getAllFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.GET_ALL_FAILURE, ['directoryViews', 'discoveryViews'])),
        map((action: fromSdr.GetAllResourcesFailureAction) => this.alert.getAllFailureAlert(action.payload))
    );

    @Effect() getDirectoryViews = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL, 'directoryViews')),
        switchMap((action: fromSdr.GetAllResourcesAction) =>
            this.repos.get(action.name).getAll().pipe(
                map((collection: SdrCollection) => new fromSdr.GetAllResourcesSuccessAction(action.name, { collection })),
                catchError((response) => of(new fromSdr.GetAllResourcesFailureAction(action.name, { response })))
            )
        )
    );

    @Effect({ dispatch: false }) getDirectoryViewsSuccess = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL_SUCCESS, 'directoryViews')),
        switchMap((action: fromSdr.GetAllResourcesSuccessAction) => this.waitForStompConnection(action.name)),
        withLatestFrom(this.store.pipe(select(selectStompState))),
        map(([combination, stomp]) => this.subscribeToResourceQueue(combination[0], stomp))
    );

    @Effect() getDirectoryViewsFailure = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL_FAILURE, 'directoryViews')),
        map((action: fromSdr.GetAllResourcesFailureAction) => this.alert.getAllFailureAlert(action.payload))
    );

    @Effect() getDiscoveryViews = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL, 'discoveryViews')),
        switchMap((action: fromSdr.GetAllResourcesAction) => this.getAllHandler(action.name))
    );

    @Effect({ dispatch: false }) getDiscoveryViewsSuccess = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL_SUCCESS, 'discoveryViews')),
        switchMap((action: fromSdr.GetAllResourcesSuccessAction) => this.waitForStompConnection(action.name)),
        withLatestFrom(this.store.pipe(select(selectStompState))),
        map(([combination, stomp]) => this.subscribeToResourceQueue(combination[0], stomp))
    );

    @Effect() getDiscoveryViewsFailure = this.actions.pipe(
        ofType(fromSdr.getSdrAction(fromSdr.SdrActionTypes.GET_ALL_FAILURE, 'discoveryViews')),
        map((action: fromSdr.GetAllResourcesFailureAction) => this.alert.getAllFailureAlert(action.payload))
    );

    @Effect() page = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PAGE)),
        switchMap((action: fromSdr.PageResourcesAction) => this.getAllHandler(action.name))
    );

    @Effect({ dispatch: false }) pageSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PAGE_SUCCESS)),
        switchMap((action: fromSdr.PageResourcesSuccessAction) => this.waitForStompConnection(action.name)),
        withLatestFrom(this.store.pipe(select(selectStompState))),
        map(([combination, stomp]) => this.subscribeToResourceQueue(combination[0], stomp))
    );

    @Effect() pageFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PAGE_FAILURE)),
        map((action: fromSdr.PageResourcesFailureAction) => this.alert.pageFailureAlert(action.payload))
    );

    @Effect() search = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.SEARCH)),
        switchMap((action: fromSdr.SearchResourcesAction) =>
            this.repos.get(action.name).search(action.payload.request).pipe(
                map((collection: SdrCollection) => new fromSdr.SearchResourcesSuccessAction(action.name, { collection })),
                catchError((response) => of(new fromSdr.SearchResourcesFailureAction(action.name, { response })))
            )
        )
    );

    @Effect({ dispatch: false }) searchSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.SEARCH_SUCCESS)),
        switchMap((action: fromSdr.SearchResourcesSuccessAction) => combineLatest(
            of(action),
            this.store.pipe(select(selectRouterState)),
            this.store.pipe(
                select(selectAllResources('directoryViews')),
                filter((views: DirectoryView[]) => views.length !== 0)
            ),
            this.store.pipe(
                select(selectAllResources('discoveryViews')),
                filter((views: DiscoveryView[]) => views.length !== 0)
            ),
            this.store.pipe(
                select(selectIsStompConnected),
                skipWhile((connected: boolean) => !connected),
                take(1)
            )
        )),
        withLatestFrom(this.store),
        map(([combination, store]) => this.searchSuccessHandler(combination[0], combination[1].state, store))
    );

    @Effect() searchFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.SEARCH_FAILURE)),
        map((action: fromSdr.SearchResourcesFailureAction) => this.alert.searchFailureAlert(action.payload))
    );

    @Effect() clearResourceSubscription = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.CLEAR)),
        map((action: fromSdr.PageResourcesSuccessAction) => new fromStomp.UnsubscribeAction({ channel: `/queue/${action.name}` }))
    );

    @Effect() post = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.POST)),
        switchMap((action: fromSdr.PostResourceAction) =>
            this.repos.get(action.name).post(action.payload.resource).pipe(
                map((resource: SdrResource) => new fromSdr.PostResourceSuccessAction(action.name, { resource })),
                catchError((response) => of(new fromSdr.PostResourceFailureAction(action.name, { response })))
            )
        )
    );

    @Effect() postSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.POST_SUCCESS)),
        switchMap((action: fromSdr.PostResourceSuccessAction) => [
            new fromDialog.CloseDialogAction(),
            this.alert.postSuccessAlert(action)
        ])
    );

    @Effect() postFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.POST_FAILURE)),
        map((action: fromSdr.PostResourceFailureAction) => this.alert.postFailureAlert(action.payload))
    );

    @Effect() put = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PUT)),
        switchMap((action: fromSdr.PutResourceAction) =>
            this.repos.get(action.name).put(action.payload.resource).pipe(
                map((resource: SdrResource) => new fromSdr.PutResourceSuccessAction(action.name, { resource })),
                catchError((response) => of(new fromSdr.PutResourceFailureAction(action.name, { response })))
            )
        )
    );

    @Effect() putSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PUT_SUCCESS)),
        switchMap((action: fromSdr.PutResourceSuccessAction) => [
            new fromDialog.CloseDialogAction(),
            this.alert.putSuccessAlert(action)
        ])
    );

    @Effect() putFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PUT_FAILURE)),
        map((action: fromSdr.PutResourceFailureAction) => this.alert.putFailureAlert(action.payload))
    );

    @Effect() patch = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PATCH)),
        switchMap((action: fromSdr.PatchResourceAction) =>
            this.repos.get(action.name).patch(action.payload.resource).pipe(
                map((resource: SdrResource) => new fromSdr.PatchResourceSuccessAction(action.name, { resource })),
                catchError((response) => of(new fromSdr.PatchResourceFailureAction(action.name, { response })))
            )
        )
    );

    @Effect() patchSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PATCH_SUCCESS)),
        switchMap((action: fromSdr.PatchResourceSuccessAction) => [
            new fromDialog.CloseDialogAction(),
            this.alert.patchSuccessAlert(action)
        ])
    );

    @Effect() patchFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.PATCH_FAILURE)),
        map((action: fromSdr.PatchResourceFailureAction) => this.alert.patchFailureAlert(action.payload))
    );

    @Effect() delete = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.DELETE)),
        switchMap((action: fromSdr.DeleteResourceAction) =>
            this.repos.get(action.name).delete(action.payload.id).pipe(
                map(() => new fromSdr.DeleteResourceSuccessAction(action.name)),
                catchError((response) => of(new fromSdr.DeleteResourceFailureAction(action.name, { response })))
            )
        )
    );

    @Effect() deleteSuccess = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.DELETE_SUCCESS)),
        switchMap((action: fromSdr.DeleteResourceSuccessAction) => [
            new fromDialog.CloseDialogAction(),
            this.alert.deleteSuccessAlert(action)
        ])
    );

    @Effect() deleteFailure = this.actions.pipe(
        ofType(...this.buildActions(fromSdr.SdrActionTypes.DELETE_FAILURE)),
        map((action: fromSdr.DeleteResourceFailureAction) => this.alert.deleteFailureAlert(action.payload))
    );

    @Effect({ dispatch: false }) navigation = this.actions.pipe(
        ofType(fromRouter.RouterActionTypes.CHANGED),
        withLatestFrom(this.store.pipe(select(selectRouterState))),
        map(([action, router]) => {
            let collection = router.state.data.collection;
            if (collection === undefined) {
                collection = router.state.queryParams.collection;
            }
            if (collection) {
                const request = this.createSdrRequest(router.state);
                if (router.state.url.startsWith('/directory') || router.state.url.startsWith('/discovery')) {
                    this.store.dispatch(new fromSdr.SearchResourcesAction(collection, { request }));
                } else {
                    this.store.dispatch(new fromSdr.PageResourcesAction(collection, { request }));
                }
            }
        })
    );

    @Effect() initViews = defer(() => of(new fromSdr.GetAllResourcesAction('directoryViews'), new fromSdr.GetAllResourcesAction('discoveryViews')));

    private injectRepos(): void {
        const injector = Injector.create({
            providers: injectable,
            parent: this.injector
        });
        for (const name in repos) {
            if (repos.hasOwnProperty(name)) {
                this.repos.set(name, injector.get<AbstractSdrRepo<SdrResource>>(repos[name]));
            }
        }
    }

    private buildActions(actionType: fromSdr.SdrActionTypes, exclude: string[] = []): string[] {
        const loadActions = [];
        for (const name in repos) {
            if (repos.hasOwnProperty(name) && !exclude.includes(name)) {
                loadActions.push(fromSdr.getSdrAction(actionType, name));
            }
        }
        return loadActions;
    }

    private waitForStompConnection(name: string): Observable<[string, boolean]> {
        return combineLatest(
            of(name),
            this.store.pipe(
                select(selectIsStompConnected),
                skipWhile((connected: boolean) => !connected),
                take(1)
            )
        );
    }

    private subscribeToResourceQueue(name: string, stomp: StompState): void {
        if (!stomp.subscriptions.has(`/queue/${name}`)) {
            this.store.dispatch(new fromStomp.SubscribeAction({
                channel: `/queue/${name}`,
                handle: (frame: any) => {
                    // TODO: conditionally reload all
                    if (frame.command === 'MESSAGE') {
                        console.log(frame);
                    }
                }
            }));
        }
    }

    private getAllHandler(name: string): Observable<fromSdr.GetAllResourcesSuccessAction | fromSdr.GetAllResourcesFailureAction> {
        return this.repos.get(name).getAll().pipe(
            map((collection: SdrCollection) => new fromSdr.GetAllResourcesSuccessAction(name, { collection })),
            catchError((response) => of(new fromSdr.GetAllResourcesFailureAction(name, { response })))
        );
    }

    private searchSuccessHandler(action: fromSdr.SearchResourcesSuccessAction, routerState: CustomRouterState, store: AppState): void {
        if (routerState.queryParams.collection) {

            let facets: Facet[] = [];

            if (routerState.url.startsWith('/directory')) {
                facets = store['directoryViews'].entities[routerState.params.view].facets;
            } else if (routerState.url.startsWith('/discovery')) {
                facets = store['discoveryViews'].entities[routerState.params.view].facets;
            }

            const sdrFacets: SdrFacet[] = action.payload.collection.facets;

            const sidebarMenu: SidebarMenu = {
                sections: [],
                open: true
            };

            facets.filter((facet: Facet) => !facet.hidden).forEach((facet: Facet) => {

                for (const sdrFacet of sdrFacets) {

                    if (sdrFacet.field === facet.field) {

                        const sidebarSection: SidebarSection = {
                            title: of(facet.name),
                            items: [],
                            collapsible: true,
                            collapsed: false
                        };

                        sdrFacet.entries.forEach((facetEntry: SdrFacetEntry) => {

                            let selected = false;

                            for (const requestFacet of routerState.queryParams.facets.split(',')) {
                                if (routerState.queryParams[`${requestFacet}.filter`] === facetEntry.value) {
                                    selected = true;
                                    break;
                                }
                            }

                            const sidebarItem: SidebarItem = {
                                label: of(facetEntry.value),
                                selected: selected,
                                total: facetEntry.count,
                                route: [],
                                queryParams: {},
                            };

                            sidebarItem.queryParams[`${sdrFacet.field}.filter`] = !selected ? facetEntry.value : undefined;

                            sidebarSection.items.push(sidebarItem);

                        });
                        sidebarMenu.sections.push(sidebarSection);
                        break;
                    }
                }
            });

            this.store.dispatch(new fromSidebar.LoadSidebarAction({ menu: sidebarMenu }));
        }

        this.subscribeToResourceQueue(action.name, store.stomp);
    }

    private createSdrRequest(routerState: CustomRouterState): SdrRequest {
        const queryParams = routerState.queryParams;
        return {
            pageable: this.buildPageable(queryParams),
            facets: this.buildFacets(queryParams),
            indexable: this.buildIndexable(queryParams),
            query: queryParams.query
        };
    }

    private buildPageable(queryParams: Params): Pageable {
        return {
            number: queryParams.page,
            size: queryParams.size,
            sort: this.buildSort(queryParams.sort)
        };
    }

    private buildSort(sortParams: string): Sort[] {
        const sort: Sort[] = [];
        if (sortParams !== undefined) {
            if (Array.isArray(sortParams)) {
                sortParams.forEach((currentSortParam) => sort.push(this.splitSort(currentSortParam)));
            } else {
                sort.push(this.splitSort(sortParams));
            }
        }
        return sort;
    }

    private splitSort(sortParam: string): Sort {
        const sortSplit = sortParam.split(',');
        return {
            name: sortSplit[0],
            direction: Direction[sortSplit[1] !== undefined ? sortSplit[1].toUpperCase() : 'ASC']
        };
    }

    private buildFacets(queryParams: Params): Facetable[] {
        const facets: Facetable[] = [];
        const fields: string[] = queryParams.facets !== undefined ? queryParams.facets.split(',') : [];
        fields.forEach((field: string) => {
            const facet: Facetable = { field };
            ['limit', 'offset', 'sort', 'filter'].forEach((key: string) => {
                if (queryParams[`${field}.${key}`]) {
                    facet[key] = key === 'sort' ? FacetSort[queryParams[`${field}.${key}`]] : queryParams[`${field}.${key}`];
                }
            });
            facets.push(facet);
        });
        return facets;
    }

    private buildIndexable(queryParams: Params): Indexable {
        if (queryParams.index) {
            const indexSplit: string[] = queryParams.index.split(',');
            return {
                field: indexSplit[0],
                operationKey: OperationKey[indexSplit[1]],
                option: indexSplit[2]
            };
        }
    }

}
