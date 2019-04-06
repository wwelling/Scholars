package edu.tamu.scholars.middleware.defaults;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternResolver;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import edu.tamu.scholars.middleware.config.MiddlewareConfig;
import edu.tamu.scholars.middleware.theme.model.Named;
import edu.tamu.scholars.middleware.theme.model.repo.NamedRepo;

public abstract class AbstractDefaults<E extends Named, R extends NamedRepo<E>> implements Defaults<E, R> {

    private static final String CREATED_DEFAULTS = "Created %s defaults.";

    private static final String UPDATED_DEFAULTS = "Updated %s defaults.";

    protected static final String CLASSPATH = "classpath:%s";

    protected static final String IO_EXCEPTION_MESSAGE = "Could not read %s. Either does not exists or is not a file.";

    private final Logger logger = LoggerFactory.getLogger(this.getClass());

    // @formatter:off
    protected final TypeReference<List<E>> ENTITY_TYPE_REF = new TypeReference<List<E>>() {};
    // @formatter:on

    protected final ObjectMapper mapper;

    @Autowired
    private MiddlewareConfig middleware;

    @Autowired
    protected ResourcePatternResolver resolver;

    @Autowired
    protected R repo;

    public AbstractDefaults() {
        mapper = new ObjectMapper(new YAMLFactory());
    }

    @Override
    public void load() throws IOException {
        Resource resource = resolver.getResource(path());
        if (resource.exists() && resource.isFile()) {
            List<E> entities = read(resource.getInputStream());
            for (E entity : entities) {
                process(entity);
            }
        }
    }

    @Override
    public void process(E entity) {
        Optional<E> existingEntity = repo.findByName(entity.getName());
        if (existingEntity.isPresent()) {
            update(entity, existingEntity.get());
        } else {
            repo.save(entity);
            logger.info(String.format(CREATED_DEFAULTS, entity.getName()));
        }
    }

    @Override
    public void update(E entity, E existingEntity) {
        if (middleware.isUpdateDefaults()) {
            BeanUtils.copyProperties(entity, existingEntity);
            repo.save(entity);
            logger.info(String.format(UPDATED_DEFAULTS, entity.getName()));
        }
    }

}
