import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IDataObject,
    JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { awsApiRequestREST } from '../GenericFunctions';

export class AwsBedrock implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'AWS Bedrock',
        name: 'awsBedrock',
        icon: 'file:bedrock.svg',
        group: ['output'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Interact with Amazon Bedrock models',
        defaults: {
            name: 'AWS Bedrock',
        },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        credentials: [
            {
                name: 'aws',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Invoke Model',
                        value: 'invoke',
                        action: 'Invoke a model',
                    },
                ],
                default: 'invoke',
            },
            {
                displayName: 'Model',
                name: 'model',
                type: 'options',
                default: '',
                required: true,
                typeOptions: {
                    loadOptions: {
                        routing: {
                            request: {
                                method: 'GET',
                                url: '/foundation-models?byOutputModality=TEXT&byInferenceType=ON_DEMAND',
                            },
                            output: {
                                postReceive: [
                                    {
                                        type: 'rootProperty',
                                        properties: {
                                            property: 'modelSummaries',
                                        },
                                    },
                                    {
                                        type: 'setKeyValue',
                                        properties: {
                                            name: '={{$responseItem.modelName}}',
                                            value: '={{$responseItem.modelId}}',
                                            description: '={{$responseItem.modelArn}}',
                                        },
                                    },
                                    {
                                        type: 'sort',
                                        properties: {
                                            key: 'name',
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
                displayOptions: {
                    show: {
                        operation: ['invoke'],
                    },
                },
                description: 'Model to invoke',
            },
            {
                displayName: 'Prompt',
                name: 'prompt',
                type: 'string',
                default: '',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['invoke'],
                    },
                },
                description: 'User prompt to send to the model',
            },
            {
                displayName: 'Binary Property Name',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['invoke'],
                    },
                },
                description: 'Name of the binary property containing the image to send',
            },
            {
                displayName: 'Max Tokens',
                name: 'maxTokens',
                type: 'number',
                default: 1024,
                displayOptions: {
                    show: {
                        operation: ['invoke'],
                    },
                },
                description: 'Maximum number of tokens in the response',
            },
            {
                displayName: 'Temperature',
                name: 'temperature',
                type: 'number',
                typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
                default: 0.5,
                displayOptions: {
                    show: {
                        operation: ['invoke'],
                    },
                },
                description: 'Controls randomness in the response',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];
        const operation = this.getNodeParameter('operation', 0);

        for (let i = 0; i < items.length; i++) {
            try {
                if (operation === 'invoke') {
                    const modelId = this.getNodeParameter('model', i) as string;
                    const prompt = this.getNodeParameter('prompt', i) as string;
                    const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
                    const maxTokens = this.getNodeParameter('maxTokens', i) as number;
                    const temperature = this.getNodeParameter('temperature', i) as number;

                    const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
                    const mimeType = items[i].binary?.[binaryPropertyName]?.mimeType || 'image/jpeg';

                    const body: IDataObject = {
                        anthropic_version: 'bedrock-2023-05-31',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'image',
                                        source: {
                                            type: 'base64',
                                            media_type: mimeType,
                                            data: binaryData.data.toString('base64'),
                                        },
                                    },
                                    {
                                        type: 'text',
                                        text: prompt,
                                    },
                                ],
                            },
                        ],
                        max_tokens: maxTokens,
                        temperature,
                    } as IDataObject;

                    const headers = { 'Content-Type': 'application/json' };

                    const responseData = await awsApiRequestREST.call(
                        this,
                        'bedrock-runtime',
                        'POST',
                        `/model/${modelId}/invoke`,
                        JSON.stringify(body),
                        headers,
                    );

                    returnData.push({ json: responseData });
                }
            } catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({ json: { error: (error as JsonObject).message } });
                    continue;
                }
                throw error;
            }
        }

        return [returnData];
    }
}
