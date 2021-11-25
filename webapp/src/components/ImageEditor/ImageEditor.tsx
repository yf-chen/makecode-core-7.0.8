import * as React from 'react';

import { Provider, Store } from 'react-redux';
import { mainStore, tileEditorStore } from './store/imageStore'
import { SideBar } from './SideBar';
import { BottomBar } from './BottomBar';
import { TopBar } from './TopBar';
import { ImageCanvas } from './ImageCanvas';
import { Alert, AlertInfo } from './Alert';

import { Timeline } from './Timeline';
import { addKeyListener, removeKeyListener, setStore } from './keyboardShortcuts';

import { dispatchSetInitialState, dispatchImageEdit, dispatchChangeZoom, dispatchOpenAsset, dispatchCloseTileEditor, dispatchDisableResize, dispatchChangeAssetName, dispatchChangeImageDimensions, dispatchSetFrames } from './actions/dispatch';
import { EditorState, AnimationState, TilemapState, GalleryTile, ImageEditorStore } from './store/imageReducer';
import { imageStateToBitmap, imageStateToTilemap, applyBitmapData } from './util';
import { Unsubscribe, Action } from 'redux';
import { createNewImageAsset, getNewInternalID } from '../../assets';

export interface ImageEditorSaveState {
    editor: EditorState;
    past: AnimationState[];
}

export interface ImageEditorProps {
    singleFrame?: boolean;
    onChange?: (value: string) => void;
    asset?: pxt.Asset;
    store?: Store<ImageEditorStore>;
    onDoneClicked?: (value: pxt.Asset) => void;
    onTileEditorOpenClose?: (open: boolean) => void;
    nested?: boolean;
}

export interface ImageEditorState {
    editingTile: boolean;
    tileToEdit?: pxt.Tile;
    resizeDisabled?: boolean;
    alert?: AlertInfo;
}

export class ImageEditor extends React.Component<ImageEditorProps, ImageEditorState> {
    protected unsubscribeChangeListener: Unsubscribe;

    constructor(props: ImageEditorProps) {
        super(props);

        this.state = { editingTile: false };
    }

    componentDidMount() {
        addKeyListener();

        if (this.props.asset) {
            this.openAsset(this.props.asset);
        }

        this.unsubscribeChangeListener = this.getStore().subscribe(this.onStoreChange);

        this.onResize();
    }

    componentWillUnmount() {
        if (!this.props.nested) removeKeyListener();

        if (this.unsubscribeChangeListener) {
            this.unsubscribeChangeListener()
        }
    }

    render(): JSX.Element {
        const { singleFrame } = this.props;
        const instanceStore = this.getStore();

        const { tileToEdit, editingTile, alert } = this.state;

        const isAnimationEditor = instanceStore.getState().store.present.kind === "Animation"

        return <div className="image-editor-outer">
            <Provider store={instanceStore}>
                <div className={`image-editor ${editingTile ? "editing-tile" : ""}`}>
                    <TopBar singleFrame={singleFrame} />
                    <div className="image-editor-content">
                        <SideBar />
                        <ImageCanvas suppressShortcuts={editingTile} />
                        {isAnimationEditor && !singleFrame ? <Timeline /> : undefined}
                    </div>
                    <BottomBar singleFrame={singleFrame} onDoneClick={this.onDoneClick} />
                    {alert && alert.title && <Alert title={alert.title} text={alert.text} options={alert.options} />}
                </div>
            </Provider>
            {editingTile && <ImageEditor store={tileEditorStore} ref="nested-image-editor" onDoneClicked={this.onTileEditorFinished} asset={tileToEdit} singleFrame={true} nested={true} />}
        </div>
    }

    openAsset(asset: pxt.Asset, gallery?: GalleryTile[], keepPast = false) {
        this.dispatchOnStore(dispatchOpenAsset(asset, keepPast, gallery))

        if (asset.meta.displayName) {
            this.dispatchOnStore(dispatchChangeAssetName(asset.meta.displayName));
        }
        else if (keepPast) {
            this.dispatchOnStore(dispatchChangeAssetName(""));
        }
    }

    openGalleryAsset(asset: pxt.Animation | pxt.ProjectImage | pxt.Tile) {
        const current = this.getAsset();

        const frames = (this.getStore().getState().store.present as AnimationState).frames;

        switch (current.type) {
            case pxt.AssetType.Animation:
                switch (asset.type) {
                    case pxt.AssetType.Image:
                    case pxt.AssetType.Tile:
                        this.setCurrentFrame(pxt.sprite.Bitmap.fromData(asset.bitmap), frames.length === 1);
                        break;
                    case pxt.AssetType.Animation:
                        this.dispatchOnStore(dispatchSetFrames(asset.frames.map(b => ({ bitmap: b }))));
                        break;
                }
                break;
            case pxt.AssetType.Image:
            case pxt.AssetType.Tile:
                switch (asset.type) {
                    case pxt.AssetType.Image:
                    case pxt.AssetType.Tile:
                        this.setCurrentFrame(pxt.sprite.Bitmap.fromData(asset.bitmap), true);
                        break;
                    case pxt.AssetType.Animation:
                        this.setCurrentFrame(pxt.sprite.Bitmap.fromData(asset.frames[0]), true);
                        break;
                }
        }
    }

    onResize() {
        this.dispatchOnStore(dispatchChangeZoom(0));
    }

    getCurrentFrame(): pxt.sprite.Bitmap {
        const state = this.getStore().getState();
        const animationState = state.store.present as AnimationState;
        const currentFrame = animationState.frames[animationState.currentFrame];

        return imageStateToBitmap(currentFrame);
    }

    getAsset(): pxt.Asset {
        const type = this.getStore().getState().store.present.asset.type;
        switch (type) {
            case pxt.AssetType.Tile:
                return this.getTile();
            case pxt.AssetType.Animation:
                return this.getAnimation();
            case pxt.AssetType.Tilemap:
                return this.getTilemap();
            default:
                return this.getImage();
        }
    }

    getImage(): pxt.ProjectImage {
        const state = this.getStore().getState().store.present;
        const data = this.getCurrentFrame().data();

        const meta: pxt.AssetMetadata = state.asset ? { ...state.asset.meta } : {};

        return {
            id: state.asset?.id,
            internalID: state.asset ? state.asset.internalID : getNewInternalID(),
            type: pxt.AssetType.Image,
            bitmap: data,
            jresData: pxt.sprite.base64EncodeBitmap(data),
            meta
        }
    }

    getTile(): pxt.Tile {
        const state = this.getStore().getState().store.present;
        const data = this.getCurrentFrame().data();

        const meta: pxt.AssetMetadata = state.asset ? { ...state.asset.meta } : {};

        return {
            id: state.asset?.id,
            internalID: state.asset ? state.asset.internalID : getNewInternalID(),
            isProjectTile: true,
            type: pxt.AssetType.Tile,
            bitmap: data,
            jresData: pxt.sprite.base64EncodeBitmap(data),
            meta
        }
    }

    getAnimation(): pxt.Animation {
        const state = this.getStore().getState();
        const animationState = state.store.present as AnimationState;

        const meta: pxt.AssetMetadata = animationState.asset ? { ...animationState.asset.meta } : {};

        return {
            id: animationState.asset?.id,
            internalID: animationState.asset ? animationState.asset.internalID : getNewInternalID(),
            type: pxt.AssetType.Animation,
            interval: animationState.interval,
            frames: animationState.frames.map(frame => imageStateToBitmap(frame).data()),
            meta
        }
    }

    getTilemap(): pxt.ProjectTilemap {
        const state = this.getStore().getState();
        const tilemapState = state.store.present as TilemapState;
        const { floating, overlayLayers, layerOffsetX, layerOffsetY } = tilemapState.tilemap;
        const layers = applyBitmapData(overlayLayers[0], floating && floating.overlayLayers && floating.overlayLayers[0], layerOffsetX, layerOffsetY);

        const out = new pxt.sprite.TilemapData(imageStateToTilemap(tilemapState.tilemap), tilemapState.tileset, layers);
        out.deletedTiles = state.editor.deletedTiles;
        out.editedTiles = state.editor.editedTiles;

        const meta: pxt.AssetMetadata = tilemapState.asset ? { ...tilemapState.asset.meta } : {};

        return {
            id: tilemapState.asset?.id,
            internalID: tilemapState.asset ? tilemapState.asset.internalID : getNewInternalID(),
            type: pxt.AssetType.Tilemap,
            data: out,
            meta
        }
    }

    getPersistentData(): ImageEditorSaveState {
        const state = this.getStore().getState();
        return {
            editor: state.editor,
            past: state.store.past as AnimationState[]
        }
    }

    restorePersistentData(oldValue: ImageEditorSaveState) {
        if (oldValue) {
            this.dispatchOnStore(dispatchSetInitialState(oldValue.editor, oldValue.past));
        }
    }

    setCurrentFrame(bitmap: pxt.sprite.Bitmap, shrinkIfNecessary: boolean) {
        if (!shrinkIfNecessary) {
            const state = this.getStore().getState();
            const current = (state.store.present as AnimationState).frames[0];

            if (bitmap.width !== current.bitmap.width || bitmap.height !== current.bitmap.height) {
                const dimensions: [number, number] = [
                    Math.max(bitmap.width, current.bitmap.width), Math.max(bitmap.height, current.bitmap.height)
                ];

                if (current.bitmap.width !== dimensions[0] || current.bitmap.height !== dimensions[1]) {
                    this.dispatchOnStore(dispatchChangeImageDimensions(dimensions));
                }

                bitmap = bitmap.copy();
                bitmap = bitmap.resize(dimensions[0], dimensions[1]);
            }
        }

        this.dispatchOnStore(dispatchImageEdit({ bitmap: bitmap.data() }));
    }

    openInTileEditor(bitmap: pxt.sprite.Bitmap) {
        (this.refs["nested-image-editor"] as ImageEditor).setCurrentFrame(bitmap, false);
    }

    disableResize() {
        this.dispatchOnStore(dispatchDisableResize());
    }

    closeNestedEditor() {
        if (this.state.editingTile) {
            (this.refs["nested-image-editor"] as ImageEditor)?.onDoneClick();
        }
    }

    protected getStore() {
        return this.props.store || mainStore;
    }

    protected onStoreChange = () => {
        if (this.props.onChange) {
            this.props.onChange(this.props.singleFrame ? pxt.sprite.bitmapToImageLiteral(this.getCurrentFrame(), "typescript") : "")
        }

        const store = this.getStore();
        const state = store.getState();
        setStore(store);

        if (state.editor) this.setState({ alert: state.editor.alert });

        if (!!state.editor.editingTile != !!this.state.editingTile) {
            if (state.editor.editingTile) {
                const index = state.editor.editingTile.tilesetIndex;
                if (index) {
                    const tile = (state.store.present as TilemapState).tileset.tiles[index];
                    this.setState({
                        editingTile: true,
                        tileToEdit: tile
                    });
                }
                else {
                    const tileWidth = (state.store.present as TilemapState).tileset.tileWidth;
                    const emptyTile = createNewImageAsset(pxt.AssetType.Tile, tileWidth, tileWidth, lf("myTile")) as pxt.Tile;
                    this.setState({
                        editingTile: true,
                        tileToEdit: emptyTile
                    });
                }
                if (this.props.onTileEditorOpenClose) this.props.onTileEditorOpenClose(true);
            }
            else {
                this.setState({
                    editingTile: false
                });
                if (this.props.onTileEditorOpenClose) this.props.onTileEditorOpenClose(false);
            }
        }
    }

    protected onDoneClick = () => {
        if (this.props.onDoneClicked) {
            this.props.onDoneClicked(this.getAsset());
        }
    }

    protected onTileEditorFinished = (tile: pxt.Tile) => {
        const store = this.getStore();
        const tileEditState = store.getState().editor.editingTile;
        tile.isProjectTile = true;

        this.dispatchOnStore(dispatchCloseTileEditor(tile, tileEditState.tilesetIndex))
    }

    protected dispatchOnStore(action: Action) {
        this.getStore().dispatch(action);
    }
}