import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Message Categorization and Routing
// Nodes   : 4  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Webhook                            webhook
// Lmchatopenai                       lmChatOpenAi               [ai_languageModel]
// InformationExtractor               informationExtractor       [AI]
// Postgres                           postgres
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Webhook
//    → InformationExtractor
//      → Postgres
//
// AI CONNECTIONS
// InformationExtractor.uses({ ai_languageModel: Lmchatopenai })
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'j3WhC03pQNIoKPJM',
    name: 'Message Categorization and Routing',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: false },
})
export class MessageCategorizationAndRoutingWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'a7576199-6d45-4bdd-aa96-b196ac616875',
        webhookId: '88478172-b406-4ff8-bd98-251187cb5969',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [0, 0],
    })
    Webhook = {
        path: 'message-categorize',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        options: {},
    };

    @node({
        id: '0304b8c8-f56b-44ff-a8ba-272296985804',
        name: 'LmChatOpenAi',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        version: 1.3,
        position: [200, 200],
    })
    Lmchatopenai = {
        model: {
            mode: 'list',
            value: 'gpt-4o-mini',
        },
        responsesApiEnabled: true,
        options: {},
    };

    @node({
        id: '4402bd7c-259c-49ad-9f21-8a70bb7b9d23',
        name: 'Information Extractor',
        type: '@n8n/n8n-nodes-langchain.informationExtractor',
        version: 1.2,
        position: [250, 0],
    })
    InformationExtractor = {
        text: '={{ $json.body.message }}',
        schemaType: 'fromAttributes',
        attributes: {
            attributes: [
                {
                    name: 'Priority',
                    type: 'string',
                    description: 'Priority of the issue (P0, P1, P2, P3, P4, P5)',
                    required: true,
                },
                {
                    name: 'NextAction',
                    type: 'string',
                    description: 'Description of the next required action based on the message',
                    required: true,
                },
                {
                    name: 'Department',
                    type: 'string',
                    description: 'Which department should handle this issue',
                    required: true,
                },
                {
                    name: 'UserType',
                    type: 'string',
                    description: 'The type of user sending the message, e.g., Campaigner, Donor',
                    required: true,
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'b2203d18-a3db-4261-a919-5e7bb5cc0101',
        name: 'Postgres',
        type: 'n8n-nodes-base.postgres',
        version: 2.6,
        position: [500, 0],
    })
    Postgres = {
        operation: 'insert',
        schema: {
            mode: 'list',
            value: 'public',
        },
        table: {
            mode: 'list',
            value: 'messages',
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                original_message: "={{ $('Webhook').item.json.body.message }}",
                priority: '={{ $json.Priority }}',
                next_action: '={{ $json.NextAction }}',
                department: '={{ $json.Department }}',
                user_type: '={{ $json.UserType }}',
            },
        },
        options: {},
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Webhook.out(0).to(this.InformationExtractor.in(0));
        this.InformationExtractor.out(0).to(this.Postgres.in(0));

        this.InformationExtractor.uses({
            ai_languageModel: this.Lmchatopenai.output,
        });
    }
}
