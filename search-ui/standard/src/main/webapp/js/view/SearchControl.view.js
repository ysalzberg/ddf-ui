/*global define*/

define(function (require) {
    "use strict";
    var $ = require('jquery'),
        _ = require('underscore'),
        Marionette = require('marionette'),
        SlidingRegion = require('js/view/sliding.region'),
        QueryFormView = require('js/view/Query.view').QueryView,
        ProgressView = require('js/view/Progress.view').ProgressView,
        CesiumMetacard = require('js/view/cesium.metacard'),
        MetacardList = require('js/view/MetacardList.view'),
        Metacard = require('js/view/MetacardDetail.view'),
        Backbone = require('backbone'),
        ddf = require('ddf'),
        dir = require('direction'),
        ich = require('icanhaz'),
        SearchControl = {};

    require('perfectscrollbar');

    ich.addTemplate('searchPanel', require('text!templates/search.panel.html'));

        SearchControl.SearchControlModel = Backbone.Model.extend({
            currentState: "search",
            initialize: function() {
                this.set({"title": "Search"});
            },
            setResultListState: function(resultList) {
                this.currentState = "results";
                this.set({"back": "Search"});
                if(resultList) {
                    if(this.resultList) {
                        this.stopListening(this.resultList, "change", this.setResults);
                    }
                    this.resultList = resultList;
                    this.listenTo(this.resultList, "change", this.setResults);
                }
                this.set({ "title": this.getResultText()});
                this.set({ "forward": ""});
                if(this.metacardDetail) {
                    this.set({ "forward": "Record"});
                }
            },
            setSearchFormState: function() {
                this.currentState = "search";
                this.set({ "title": "Search" });
                this.set({ "forward": ""});
                if(this.resultList) {
                    this.set({ "forward": this.getResultText()});
                }
                this.set({"back": ""});
            },
            setRecordViewState: function(metacardDetail) {
                if(metacardDetail) {
                    this.metacardDetail = metacardDetail;
                }
                this.currentState = "record";
                this.set({ "title": "Record"});
                this.set({"back": this.getResultText()});
                this.set({ "forward": ""});
            },
            setResults: function() {
                if(this.currentState === "search") {
                    this.set({ "forward": this.getResultText()});
                } else if(this.currentState === "results") {
                    this.set({ "title": this.getResultText()});
                } else if(this.currentState === "record") {
                    this.set({"back": this.getResultText()});
                }
            },
            getResultText: function() {
                return "Results";
            }
        });

        SearchControl.SearchControlLayout = Marionette.Layout.extend({
            template : 'searchPanel',
            regions : {
                progressRegion: {
                    selector: "#progressRegion",
                    regionType: SlidingRegion
                },
                leftRegion: {
                    selector: "#searchPages",
                    regionType:  SlidingRegion
                }
            },

            events: {
                'click .back': 'back',
                'click .forward': 'forward'
            },

            initialize: function (options) {

                this.queryForm = new QueryFormView({
                    sources : options.sources
                });
                this.listenTo(this.queryForm, 'content-update', this.updateScrollbar);

                this.listenTo(this.queryForm, 'clear', this.onQueryClear);
                this.listenTo(this.queryForm, 'search', this.onQueryClear);
                this.listenTo(this.queryForm, 'search', this.setupProgress);
                this.listenTo(this.queryForm, 'searchComplete', this.showResults);
                this.listenTo(this.queryForm, 'searchComplete', this.changeDefaultMapLocation);
                this.listenTo(ddf.app, 'model:context', this.showMetacardDetail);

                this.modelBinder = new Backbone.ModelBinder();
                this.controlModel = new SearchControl.SearchControlModel();
            },

            updateScrollbar: function () {
                var view = this;
                // defer seems to be necessary for this to update correctly
                _.defer(function () {
                    view.leftRegion.$el.perfectScrollbar('update');
                });
            },

            updateScrollPos: function () {
                var view = this;
                // defer seems to be necessary for this to update correctly
                _.defer(function () {
                    var selected = view.leftRegion.$el.find('.selected');
                    var container = $('#searchPages');
                    if(selected.length !== 0)
                    {
                        container.scrollTop(selected.offset().top - container.offset().top + container.scrollTop());
                    }
                });
            },

            onRender : function(){
                this.leftRegion.show(this.queryForm, dir.forward);

                var bindings = Backbone.ModelBinder.createDefaultBindings(this.el, 'name');
                this.modelBinder.bind(this.controlModel, this.$el, bindings);

                return this;
            },
            setupProgress: function (resultList, queryModel, numSources, progressObj) {
                if (!resultList.useAjaxSync) {
                    if (numSources > 1) {
                        if (this.progressView) {
                            this.progressView.close();
                        }
                        this.progressView = new ProgressView({ resultList: resultList, queryModel: queryModel, sources: numSources, model: progressObj});
                        this.progressRegion.show(this.progressView, dir.downward);
                    }
                }
            },
            onQueryClear: function () {
                $(".forward").hide();
                if (this.mapViews) {
                    this.mapViews.close();
                }
                if (this.metacardDetail) {
                    this.metacardDetail.remove();
                    delete this.metacardDetail;
                }
                if (this.progressView) {
                    this.progressView.close();
                }
            },
            back: function () {
                if (this.leftRegion.currentView === this.resultList) {
                    //go back to query
                    this.showQuery(dir.backward);
                }
                else if (this.leftRegion.currentView === this.metacardDetail) {
                    this.showResults(null, dir.backward);
                }
            },
            forward: function () {
                if (this.leftRegion.currentView === this.queryForm) {
                    this.showResults(null, dir.forward);
                }
                else if (this.leftRegion.currentView === this.resultList) {
                    this.showMetacardDetail(null, dir.forward);
                }
            },
            changeDefaultMapLocation: function (result, shouldFlyToExtent) {
                console.log("changing "+result);
                if(shouldFlyToExtent) {
                    var extent = result.getResultCenterPoint();
                    if(extent) {
                        ddf.app.controllers.geoController.flyToExtent(extent);
                    }
                }
            },
            showQuery: function (direction) {
                $(".back").hide();
                $(".forward").show();
                this.controlModel.setSearchFormState();
                this.leftRegion.show(this.queryForm, direction);
            },
            showResults: function (result, direction) {
                $(".forward").hide();
                $(".back").show();
                if (this.metacardDetail) {
                    $(".forward").show();
                }

                this.controlModel.setResultListState(result);
                if (result) {
                    // TODO replace with trigger
                    if (this.mapViews) {
                        this.mapViews.close();
                    }
                    if (ddf.app.controllers.geoController.enabled) {
                        this.mapViews = new CesiumMetacard.ResultsView({
                            collection: result.get('results'),
                            geoController: ddf.app.controllers.geoController
                        }).render();
                    }
                    if(this.resultList){
                        this.stopListening(this.resultList, 'content-update', this.updateScrollbar);
                        this.stopListening(this.resultList, 'render', this.updateScrollPos);
                    }

                    this.resultList = new MetacardList.MetacardListView({ result: result, searchControlView: this });
                    this.listenTo(this.resultList, 'content-update', this.updateScrollbar);
                    this.listenTo(this.resultList, 'render', this.updateScrollPos);
                }
                this.leftRegion.show(this.resultList, direction);
            },
            showMetacardDetail: function (metacard, direction) {
                $(".back").show();
                $(".forward").hide();
                this.controlModel.setRecordViewState(metacard);

                if (!metacard && this.metacardDetail) {
                    this.metacardDetail.model.set('direction', dir.forward);
                    metacard = this.metacardDetail.model;
                }

                if (metacard) {
                    if (this.metacardDetail) {
                        this.stopListening(this.metacardDetail, 'content-update', this.updateScrollbar);
                    }
                    this.metacardDetail = new Metacard.MetacardDetailView({metacard: metacard});
                    this.listenTo(this.metacardDetail, 'content-update', this.updateScrollbar);
                    direction = _.isUndefined(metacard.get('direction')) ? direction : metacard.get('direction');
                }

                this.leftRegion.show(this.metacardDetail, direction);
            }
        });

    return SearchControl;
});
