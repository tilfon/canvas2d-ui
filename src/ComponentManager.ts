import { Utility } from './Utility';
import { Observable } from './Observable';
import { ObservableObject } from './ObservableObject';
import { VirtualView } from './ViewManager';
import { BindingManager } from './BindingManager';
import { WatcherManager } from './WatcherManager';
import { EventEmitter, Sprite } from 'canvas2djs';

export class ComponentManager {

    private static componentModelSources: { [uid: string]: object } = {};
    private static registeredComponentProperties: { [uid: string]: { [property: string]: Function | Function[] } } = {};
    private static registeredComponentCtors: { [name: string]: Function } = {};
    public static registeredBaseComponentCtors: { [name: string]: IBaseComponentCtor } = {};

    public static registerComponent(name: string, ctor: Function, extendComponentName?: string) {
        if (this.registeredComponentCtors[name] != null) {
            Utility.warn(`Component "${name}" is override,`, ctor);
        }
        this.registeredComponentCtors[name] = ctor;
        if (extendComponentName == null) {
            return;
        }
        let properties = this.getRegisteredComponentPropertiesByName(extendComponentName);
        if (properties == null) {
            Utility.warn(`Component "${extendComponentName}" has not registered properties.`);
        }
        else {
            this.registerComponentProperties(ctor, properties);
        }
    }

    public static registerBaseComponent(name: string, ctor: IBaseComponentCtor, extendComponentName?: string) {
        if (this.registeredBaseComponentCtors[name] != null) {
            Utility.warn(`Component "${name}" is override,`, ctor);
        }
        this.registeredBaseComponentCtors[name] = ctor;
        if (extendComponentName == null) {
            return;
        }
        let properties = this.getRegisteredBaseComponentPropertiesByName(extendComponentName);
        if (properties == null) {
            Utility.warn(`Component "${extendComponentName}" has not registered properties.`);
        }
        else {
            this.registerComponentProperties(ctor, properties);
        }
    }

    public static registerComponentProperty(component: IComponent, property: string, type: Function | Function[]) {
        let uid = Utility.getUid(component.constructor);
        if (!this.registeredComponentProperties[uid]) {
            this.registeredComponentProperties[uid] = {};
        }
        this.registeredComponentProperties[uid][property] = type;
    }

    public static registerComponentProperties(componentCtor: Function, properties: { [property: string]: Function | Function[] }) {
        let uid = Utility.getUid(componentCtor);
        if (!this.registeredComponentProperties[uid]) {
            this.registeredComponentProperties[uid] = {};
        }
        this.registeredComponentProperties[uid] = {
            ...this.registeredComponentProperties[uid],
            ...properties
        };
    }

    public static createComponentByName(name: string) {
        let ctor: any = this.registeredComponentCtors[name];
        if (!ctor) {
            Utility.error(`Component "${name}" not found.`);
        }

        let instance = new ctor();
        let modelSource = this.createComponentModelSource(instance);
        let registeredProperties = this.getRegisteredComponentPropertiesByName(name);
        if (registeredProperties) {
            for (let property in registeredProperties) {
                let value = instance[property];
                Utility.createProxy(instance, property, modelSource);
                ObservableObject.setProperty(modelSource, property, value);
            }
        }
        if (typeof instance.onInit === "function") {
            instance.onInit();
        }

        return instance;
    }

    public static createComponentByConstructor(ctor: Function) {
        let instance = new (ctor as any)();
        let modelSource = this.createComponentModelSource(instance);
        let registeredProperties = this.getRegisteredComponentProperties(instance);
        if (registeredProperties) {
            for (let property in registeredProperties) {
                let value = instance[property];
                Utility.createProxy(instance, property, modelSource);
                ObservableObject.setProperty(modelSource, property, value);
            }
        }
        if (typeof instance.onInit === "function") {
            instance.onInit();
        }

        return instance;
    }

    public static mountComponent(component: IComponent, view: VirtualView) {
        if (typeof component.onBeforeMount === 'function') {
            component.onBeforeMount(view);
        }
        BindingManager.createBinding(component, view);
        if (typeof component.onAfterMounted === 'function') {
            component.onAfterMounted();
        }
    }

    public static getBaseComponentCtorByName(name: string) {
        return this.registeredBaseComponentCtors[name];
    }

    public static getRegisteredBaseComponentPropertiesByName(name: string) {
        let ctor = this.registeredBaseComponentCtors[name];
        return ctor && this.registeredComponentProperties[Utility.getUid(ctor)];
    }

    public static getRegisteredComponentPropertiesByName(name: string) {
        let ctor = this.registeredComponentCtors[name];
        return ctor && this.registeredComponentProperties[Utility.getUid(ctor)];
    }

    public static getRegisteredComponentProperties(component: IComponent) {
        let ctor = component.constructor;
        return ctor && this.registeredComponentProperties[Utility.getUid(ctor)];
    }

    public static destroyComponent(component: IComponent) {
        if (typeof component.onDestroy === 'function') {
            component.onDestroy();
        }
        BindingManager.removeBinding(component);
        WatcherManager.removeWatchers(component);

        let uid = Utility.getUid(component);
        let properties = this.getRegisteredComponentProperties(component);
        let modelSource = this.componentModelSources[uid];
        if (properties) {
            for (let property in properties) {
                if (modelSource) {
                    delete modelSource[property];
                }
                delete component[property];
            }
        }
        if (modelSource) {
            Observable.clear(modelSource);
        }
        delete this.componentModelSources[uid];
    }

    private static createComponentModelSource(component: IComponent) {
        let modelSource = Observable.toObservable({});
        let uid = Utility.getUid(component);
        this.componentModelSources[uid] = modelSource;
        return modelSource;
    }
}

export function Component(name: string, extendComponentName?: string) {
    return (componentCtor: Function) => {
        ComponentManager.registerComponent(name, componentCtor, extendComponentName);
    };
}

export function Property(type: Function = String) {
    return (component, property: string) => {
        ComponentManager.registerComponentProperty(component, property, type);
    };
}

export function BaseComponent(name: string, extendComponentName?: string) {
    return (componentCtor: IBaseComponentCtor) => {
        ComponentManager.registerBaseComponent(name, componentCtor, extendComponentName);
    }
}

export interface IComponent {
    emitter?: EventEmitter;
    onInit?();
    onBeforeMount?(views: VirtualView);
    onAfterMounted?();
    onDestroy?();
}

export interface IBaseComponentCtor {
    new(): Sprite<{}>;
}

/**
 * @Component("Button")
 * class Button {
 *     @Property(String)
 *     label: string;
 * }
 */