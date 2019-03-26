package edu.tamu.scholars.middleware.discovery.assembler;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.solr.core.query.result.FacetFieldEntry;
import org.springframework.data.solr.core.query.result.FacetPage;
import org.springframework.data.web.HateoasPageableHandlerMethodArgumentResolver;
import org.springframework.data.web.PagedResourcesAssembler;
import org.springframework.hateoas.PagedResources;
import org.springframework.hateoas.ResourceSupport;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponents;

@Component
public class FacetPagedResourcesAssembler<T> extends PagedResourcesAssembler<T> {

    public FacetPagedResourcesAssembler(@Nullable HateoasPageableHandlerMethodArgumentResolver resolver, @Nullable UriComponents baseUri) {
        super(resolver, baseUri);
    }

    @Override
    protected <R extends ResourceSupport, S> PagedResources<R> createPagedResource(List<R> resources, PagedResources.PageMetadata metadata, Page<S> page) {
        PagedResources<R> pagedResource = super.createPagedResource(resources, metadata, page);
        if (page instanceof FacetPage) {
            return new FacetPagedResource<R, S>(pagedResource, (FacetPage<S>) page);
        }
        return pagedResource;
    }

    class FacetPagedResource<R extends ResourceSupport, S> extends PagedResources<R> {

        private List<Facet> facets;

        FacetPagedResource(PagedResources<R> pagedResources, FacetPage<S> facetPage) {
            super(pagedResources.getContent(), pagedResources.getMetadata(), pagedResources.getLinks());

            List<Facet> facets = new ArrayList<Facet>();

            facetPage.getFacetResultPages().forEach(facetFieldEntryPage -> {

                Optional<String> field = Optional.empty();

                List<Entry> entries = new ArrayList<Entry>();

                for (FacetFieldEntry facetFieldEntry : facetFieldEntryPage.getContent()) {
                    if (!field.isPresent()) {
                        field = Optional.of(facetFieldEntry.getField().getName());
                    }
                    entries.add(new Entry(facetFieldEntry.getValue(), facetFieldEntry.getValueCount()));
                }

                if (field.isPresent()) {
                    facets.add(new Facet(field.get(), entries, facetFieldEntryPage.getPageable()));
                }

            });

            setFacets(facets);
        }

        public List<Facet> getFacets() {
            return facets;
        }

        public void setFacets(List<Facet> facets) {
            this.facets = facets;
        }

        class Facet {

            private String field;

            private List<Entry> entries;

            private Pageable page;

            public Facet() {

            }

            public Facet(String field, List<Entry> entries, Pageable page) {
                super();
                this.field = field;
                this.entries = entries;
                this.page = page;
            }

            public List<Entry> getEntries() {
                return entries;
            }

            public String getField() {
                return field;
            }

            public void setField(String field) {
                this.field = field;
            }

            public void setEntries(List<Entry> entries) {
                this.entries = entries;
            }

            public Pageable getPage() {
                return page;
            }

            public void setPage(Pageable page) {
                this.page = page;
            }

        }

        class Entry {

            private String value;

            private long count;

            public Entry() {

            }

            public Entry(String value, long count) {
                super();
                this.value = value;
                this.count = count;
            }

            public String getValue() {
                return value;
            }

            public void setValue(String value) {
                this.value = value;
            }

            public long getCount() {
                return count;
            }

            public void setCount(long count) {
                this.count = count;
            }

        }

    }

}