import { Utility } from './Utility';
import { Observer } from './Observer';
import { Parser } from './Parser';
import { Observable } from './Observable';
import { WatcherManager } from './WatcherManager';

export class Watcher {

    public static getKey(exp: string, isDeepWatch?: boolean): string {
        return !!isDeepWatch ? exp + '<deep>' : exp;
    }

    private callbacks: WatcherCallback[] = [];
    private hasInterpolation: boolean;
    private observers: { [id: string]: Observer } = {};
    private properties: { [number: string]: { [property: string]: boolean } } = {};
    private tmpObservers: { [id: string]: Observer };
    private tmpProperties: { [number: string]: { [property: string]: boolean } };
    private valueGetter: Function;

    public isActived: boolean = true;
    public value: any;

    constructor(
        public component,
        public exp: string,
        public isDeepWatch?: boolean
    ) {
        this.hasInterpolation = Parser.hasInterpolation(exp);
        this.valueGetter = this.hasInterpolation ? Parser.parseInterpolationToGetter(exp) : Parser.parseToGetter(exp);

        this.propertyChanged = this.propertyChanged.bind(this);
        this.value = this.getValue();
    }

    public addCallback(callback: WatcherCallback) {
        if (!this.isActived) {
            return;
        }
        Utility.addEnsureUniqueArrayItem(callback, this.callbacks);
    }

    public removeCallback(callback: WatcherCallback) {
        if (!this.isActived) {
            return;
        }
        Utility.removeItemFromArray(callback, this.callbacks);
        if (!this.callbacks.length) {
            this.destroy();
        }
    }

    public destroy() {
        if (!this.isActived) {
            return;
        }

        Object.keys(this.observers).forEach((id) => {
            Object.keys(this.properties[id]).forEach(property => {
                this.observers[id].removeListener(property, this.propertyChanged);
            });
        });

        let key: string = Watcher.getKey(this.exp, this.isDeepWatch);

        WatcherManager.removeWatcher(this.component, key);

        this.propertyChanged = this.value = this.component = this.exp = this.valueGetter = null;
        this.callbacks = this.observers = this.properties = this.tmpProperties = this.tmpObservers = null;
        this.isActived = false;
    }

    private propertyChanged(): void {
        Utility.nextTick(this.flush);
    }

    private flush = () => {
        if (!this.isActived) {
            return;
        }

        let oldValue: any = this.value;
        let newValue: any = this.getValue();

        if ((typeof newValue === 'object' && newValue != null) || newValue !== oldValue) {
            this.value = newValue;
            this.callbacks.slice().forEach(callback => {
                if (this.isActived) {
                    callback(newValue, oldValue);
                }
            });
        }
    }

    private getValue(): any {
        this.beforeCallValueGetter();

        let newValue = this.valueGetter.call(this.component);

        if (this.isDeepWatch) {
            recusiveVisit(newValue);
        }

        this.afterCallValueGetter();
        return newValue;
    }

    private beforeCallValueGetter(): void {
        this.tmpObservers = {};
        this.tmpProperties = {};
        Observable.setBeforeAccessPropertyCallback(this.subscribePropertyChanged.bind(this))
    }

    private afterCallValueGetter(): void {
        Observable.setBeforeAccessPropertyCallback(null);

        let { observers, properties, tmpObservers, tmpProperties, propertyChanged } = this;

        Object.keys(observers).forEach(id => {
            let observer = observers[id];

            if (!tmpObservers[id]) {
                Object.keys(properties[id]).forEach(property => {
                    observer.removeListener(property, propertyChanged);
                });
            }
            else {
                Object.keys(properties[id]).forEach(property => {
                    if (!tmpProperties[id][property]) {
                        observer.removeListener(property, propertyChanged);
                    }
                });
            }
        });

        this.observers = tmpObservers;
        this.properties = tmpProperties;
    }

    private subscribePropertyChanged(observer: Observer, property: string) {
        let id = Utility.getUid(observer);
        let { observers, properties, tmpObservers, tmpProperties, propertyChanged } = this;

        if (!tmpObservers[id]) {
            tmpObservers[id] = observer;
            tmpProperties[id] = { [property]: true };


            if (!observers[id]) {
                observers[id] = observer;
                properties[id] = { [property]: true };

                observer.addListener(property, propertyChanged);
            }
            else if (!properties[id][property]) {
                properties[id][property] = true;
                observer.addListener(property, propertyChanged);
            }
        }
        else if (!tmpProperties[id][property]) {
            tmpProperties[id][property] = true;

            if (!properties[id][property]) {
                observer.addListener(property, propertyChanged);
                properties[id][property] = true;
            }
        }
    }
}

function recusiveVisit(value: any) {
    if (Utility.isPlainObjectOrObservableObject(value)) {
        Object.keys(value).forEach(key => {
            recusiveVisit(value[key]);
        });
    }
    else if (Array.isArray(value)) {
        value.forEach(item => {
            recusiveVisit(item);
        });
    }
}

export type WatcherCallback = (newValue, oldValue) => any;