class Net { // gen or disc or critic
    constructor(name, archType, modelConfigs) {
        this.name = name;
        this.archType = archType;
        this.path = modelConfigs[name].paths[this.archType];
        this.inputShape = modelConfigs[name].inputShape;
        this.outputShape = modelConfigs[name].outputShape;
        this.isValid = false;
        this.hiddenLayers = [];
    }

    addLayer() {

        const modelLayer = new ModelLayer(); //document.createElement('model-layer');

        const lastHiddenLayer = this.hiddenLayers[this.hiddenLayers.length - 1];

        const lastOutputShape = lastHiddenLayer != null ? lastHiddenLayer.getOutputShape() : this.inputShape;
        this.hiddenLayers.push(modelLayer);

        modelLayer.initialize(window, lastOutputShape);
        // layerParamChanged(which)

        return modelLayer;
    }

    // layerParamChanged() {
    //     // Go through each of the model layers and propagate shapes.

    //     let lastOutputShape = this.inputShape;

    //     for (let i = 0; i < this.hiddenLayers.length; i++) {
    //         lastOutputShape = this.hiddenLayers[i].setInputShape(lastOutputShape);
    //     }
    // }

    validateNet() {
        let valid = true;

        var HiddenLayers = this.hiddenLayers;
        var lastLayerOutputShape = this.outputShape;

        for (let i = 0; i < HiddenLayers.length; ++i) {
            valid = valid && HiddenLayers[i].isValid();
        }
        if (HiddenLayers.length > 0) {
            const lastLayer = HiddenLayers[HiddenLayers.length - 1];
            valid = valid &&
                util.arraysEqual(lastLayerOutputShape, lastLayer.getOutputShape()); // for gen ,  lastLayerOutputShape = inputShape, for critic, lastLayerOutputShape = labelShape
        }

        this.isValid = valid && (HiddenLayers.length > 0);
    }
}


function setupUploadWeightsButton(fileInput, model) {
    // Show and setup the load view button.
    // const fileInput = document.querySelector('#weights-file');
    fileInput.addEventListener('change', event => {
        const file = fileInput.files[0];
        // Clear out the value of the file chooser. This ensures that if the user
        // selects the same file, we'll re-read it.
        fileInput.value = '';
        const fileReader = new FileReader();
        fileReader.onload = (evt) => {

            // console.log('loaded file:', file, fileInput);

            const weightsJson = fileReader.result;

            weights = JSON.parse(weightsJson);

            if (isValid) {
                model.createModel(weights);
            } else {
                console.log('model not valid');
            }

        };
        fileReader.readAsText(file);
    });
}


function buildFakeImageContainer(inferenceContainer, model) {
    // const inferenceContainer =
    //     document.querySelector('#generated-container');
    inferenceContainer.innerHTML = '';
    // fakeInputNDArrayVisualizers = [];
    // fakeOutputNDArrayVisualizers = [];
    for (let i = 0; i < INFERENCE_EXAMPLE_COUNT; i++) {

        if (i % INFERENCE_EXAMPLE_ROWS === 0 && i !== 0) {
            linebreak = document.createElement("br");
            inferenceContainer.appendChild(linebreak);
        }

        const inferenceExampleElement = document.createElement('div');
        inferenceExampleElement.className = 'inference-example';
        inferenceExampleElement.style.display = 'inline';

        // Set up the input visualizer.
        const ndarrayImageVisualizer = new NDArrayImageVisualizer(inferenceExampleElement)

        ndarrayImageVisualizer.setShape(model.generatorNet.outputShape);
        ndarrayImageVisualizer.setSize(
            INFERENCE_IMAGE_SIZE_PX, INFERENCE_IMAGE_SIZE_PX);
        model.fakeInputNDArrayVisualizers.push(ndarrayImageVisualizer);

        inferenceContainer.appendChild(inferenceExampleElement);
    }
}


function smoothExamplesPerSec(
    lastExamplesPerSec, nextExamplesPerSec) {
    return Number((EXAMPLE_SEC_STAT_SMOOTHING_FACTOR * lastExamplesPerSec +
            (1 - EXAMPLE_SEC_STAT_SMOOTHING_FACTOR) * nextExamplesPerSec)
        .toPrecision(3));
}

class EvalSampleModel {

    constructor(modelConfigs) {
        this.modelConfigs = modelConfigs;

        this.generatorNet = new Net('gen', 'Convolutional', modelConfigs);
        this.criticNet = new Net('crit', 'Convolutional', modelConfigs);
    }

    initialize() {

        loadNetFromPath(this.generatorNet.path, this.generatorNet);
        loadNetFromPath(this.criticNet.path, this.criticNet);

        const fileInput = document.querySelector('#weights-file');
        setupUploadWeightsButton(fileInput, this);

        // image visualizers
        this.fakeInputNDArrayVisualizers = [];
        this.visualizerElt = document.querySelector('#generated-container');
        buildFakeImageContainer(this.visualizerElt, this);

        // loss graph
        this.critLossGraph = new cnnvis.Graph();
        this.critLossWindow = new cnnutil.Window(200);
        this.lossGraphElt = document.getElementById("critlossgraph")

        // batchesEvaluated
        this.batchesEvaluatedElt = document.getElementById("examplesEvaluated");

        // examples per sec
        this.evalExamplesPerSec = 0;
        this.examplesPerSecElt = document.getElementById("evalExamplesPerSec");
    }

    displayCost(avgCost, batchesEvaluated) {

        var cost = avgCost.get();

        this.critLossWindow.add(cost);

        var xa = this.critLossWindow.get_average();

        if (xa >= 0) { // if they are -1 it means not enough data was accumulated yet for estimates
            this.critLossGraph.add(batchesEvaluated, xa);
            this.critLossGraph.drawSelf(this.lossGraphElt);
        }
    }

    displayBatchesEvaluated(totalBatchesEvaluated) {
        this.examplesEvaluated = batchSize * totalBatchesEvaluated;
        this.batchesEvaluatedElt.innerHTML = `Examples evaluated: ${this.examplesEvaluated}`
    }

    displayEvalExamplesPerSec(_examplesPerSec) {

        this.evalExamplesPerSec =
            smoothExamplesPerSec(this.evalExamplesPerSec, _examplesPerSec);

        this.examplesPerSecElt.innerHTML = `Examples/sec: ${this.evalExamplesPerSec}`;
    }

    displayInferenceExamplesOutput(
        inputFeeds, inferenceOutputs) {

        // let realImages = [];
        let fakeImages = [];

        for (let i = 0; i < inferenceOutputs.length; i++) {
            // realImages.push(inputFeeds[i][0].data);
            fakeImages.push((inferenceOutputs[i]));

        }

        // realImages =
        //     dataSet.unnormalizeExamples(realImages, IMAGE_DATA_INDEX);

        fakeImages =
            dataSet.unnormalizeExamples(fakeImages, IMAGE_DATA_INDEX);

        for (let i = 0; i < inferenceOutputs.length; i++) {
            // inputNDArrayVisualizers[i].saveImageDataFromNDArray(realImages[i]);
            this.fakeInputNDArrayVisualizers[i].saveImageDataFromNDArray(fakeImages[i]);
        }

        for (let i = 0; i < inferenceOutputs.length; i++) {
            // inputNDArrayVisualizers[i].draw();
            this.fakeInputNDArrayVisualizers[i].draw();

        }
    }

    createModel(loadedWeights = null) {

        modelInitialized = false;
        if (isValid === false) {
            return;
        }

        // Construct graph
        this.graph = new Graph();
        const g = this.graph;
        this.randomTensor = g.placeholder('random', this.generatorNet.inputShape);
        this.xTensor = g.placeholder('input', this.generatorNet.outputShape);
        this.oneTensor = g.placeholder('one', [2]);
        this.zeroTensor = g.placeholder('zero', [2]);

        const varianceInitializer = new VarianceScalingInitializer()
        const zerosInitializer = new ZerosInitializer()
        const onesInitializer = new OnesInitializer();

        let weights = null;
        if (loadedWeights != null) {

            function toArray(dicValues, dicSize) {
                var array = dicValues;
                array.length = dicSize;
                return Array.prototype.slice.call(array);
            }

            console.log('loading weights', loadedWeights);
            weights = {};
            for (var key in loadedWeights) {
                weights[key] = toArray(loadedWeights[key].ndarrayData.values, loadedWeights[key].size);
            }

        } else {
            console.log('no weights loaded, random initialize weights');
        }

        // Construct generator
        let gen = this.randomTensor;
        for (let i = 0; i < this.generatorNet.hiddenLayers.length; i++) {
            [gen] = this.generatorNet.hiddenLayers[i].addLayerMultiple(g, [gen],
                'generator-' + i.toString(), weights); // weights is a dictionary {w: NDArray, b: NDArray}
        }
        gen = g.tanh(gen);

        // Construct critic
        let crit1 = gen;
        let crit2 = this.xTensor; // real image
        for (let i = 0; i < this.criticNet.hiddenLayers.length; i++) {
            let _weights = null;
            // if (loadedWeights != null) {
            //     weights = loadedWeights[i];
            // } // always need to retrain critic (which is the process of eval), never load weights for critic
            [crit1, crit2] = this.criticNet.hiddenLayers[i].addLayerMultiple(g, [crit1, crit2],
                'critic-' + i.toString(), _weights);
        }

        this.generatedImage = gen;

        this.critPredictionReal = crit2;
        this.critPredictionFake = crit1;

        const critLossReal = g.softmaxCrossEntropyCost(
            this.critPredictionReal,
            this.oneTensor
        );
        const critLossFake = g.softmaxCrossEntropyCost(
            this.critPredictionFake,
            this.zeroTensor
        );
        this.critLoss = g.add(critLossReal, critLossFake); // js loss

        if (this.session != null) {
            this.session.dispose()
        }
        this.session = new Session(g, math);
        graphRunner.setSession(this.session);

        // startInference();

        modelInitialized = true;

        console.log('model initialized = true');
    }

    startInference() {
        const data = getImageDataOnly();
        if (data == null) {
            return;
        }
        if (isValid && (data != null)) {
            const shuffledInputProviderGenerator =
                new InCPUMemoryShuffledInputProviderBuilder([data]);
            const [inputImageProvider] =
            shuffledInputProviderGenerator.getInputProviders();

            const oneInputProvider = {
                getNextCopy(math) {
                    return Array1D.new([0, 1]);
                },
                disposeCopy(math, copy) {
                    copy.dispose();
                }
            }

            const zeroInputProvider = {
                getNextCopy(math) {
                    return Array1D.new([1, 0]);
                },
                disposeCopy(math, copy) {
                    copy.dispose();
                }
            }

            const inferenceFeeds = [{
                    tensor: this.xTensor,
                    data: inputImageProvider
                },
                {
                    tensor: this.randomTensor,
                    data: getRandomInputProvider(this.generatorNet.inputShape)
                },
                {
                    tensor: this.oneTensor,
                    data: oneInputProvider
                },
                {
                    tensor: this.zeroTensor,
                    data: zeroInputProvider
                }
            ]

            graphRunner.infer(
                this.generatedImage, null, null,
                inferenceFeeds, INFERENCE_EXAMPLE_INTERVAL_MS, INFERENCE_EXAMPLE_COUNT
            );
        }
    }

    startEvalulating() {
        const data = getImageDataOnly();

        // Recreate optimizer with the selected optimizer and hyperparameters.
        let critOptimizer = createOptimizer('crit', this.graph); // for js, exact same optimizer
        // genOptimizer = createOptimizer('gen');

        if (isValid && data != null) {
            // recreateCharts();
            graphRunner.resetStatistics();

            const shuffledInputProviderGenerator =
                new InCPUMemoryShuffledInputProviderBuilder([data]);
            const [inputImageProvider] =
            shuffledInputProviderGenerator.getInputProviders();

            const oneInputProvider = {
                getNextCopy(math) {
                    return Array1D.new([0, 1]);
                },
                disposeCopy(math, copy) {
                    copy.dispose();
                }
            }

            const zeroInputProvider = {
                getNextCopy(math) {
                    return Array1D.new([1, 0]);
                },
                disposeCopy(math, copy) {
                    copy.dispose();
                }
            }

            const critFeeds = [{
                    tensor: this.xTensor,
                    data: inputImageProvider
                },
                {
                    tensor: this.randomTensor,
                    data: getRandomInputProvider(this.generatorNet.inputShape)
                },
                {
                    tensor: this.oneTensor,
                    data: oneInputProvider
                },
                {
                    tensor: this.zeroTensor,
                    data: zeroInputProvider
                }
            ]

            const genFeeds = [{
                    tensor: this.randomTensor,
                    data: getRandomInputProvider(this.generatorNet.inputShape)
                },
                {
                    tensor: this.oneTensor,
                    data: oneInputProvider
                },
                {
                    tensor: this.zeroTensor,
                    data: zeroInputProvider
                }
            ]

            graphRunner.evaluate(
                this.critLoss, null, critFeeds, genFeeds, batchSize,
                critOptimizer, null, undefined, COST_INTERVAL_MS);

            // showEvalStats = true;
            // applicationState = ApplicationState.Evaluating;
        }
    }

}

function createOptimizer(which, graph) {
    if (which === 'gen') {
        // var selectedOptimizerName = genSelectedOptimizerName;
        // var learningRate = genLearningRate;
        // var momentum = genMomentum;
        // var gamma = genGamma;
        // var beta1 = genBeta1;
        // var beta2 = genBeta2;
        // var varName = 'generator';
    } else { // critic
        var selectedOptimizerName = critSelectedOptimizerName;
        var learningRate = critLearningRate;
        var momentum = critMomentum;
        var gamma = critGamma;
        var beta1 = critBeta1;
        var beta2 = critBeta2;
        var varName = 'critic';
    }
    switch (selectedOptimizerName) {
        case 'sgd':
            {
                return new SGDOptimizer(+learningRate,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        case 'momentum':
            {
                return new MomentumOptimizer(+learningRate, +momentum,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        case 'rmsprop':
            {
                return new RMSPropOptimizer(+learningRate, +gamma,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        case 'adagrad':
            {
                return new AdagradOptimizer(+learningRate,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        case 'adadelta':
            {
                return new AdadeltaOptimizer(+learningRate, +gamma,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        case 'adam':
            {
                return new AdamOptimizer(+learningRate, +beta1, +beta2,
                    graph.getNodes().filter((x) =>
                        x.name.startsWith(varName)));
            }
        default:
            {
                throw new Error(`Unknown optimizer`);
            }
    }
}