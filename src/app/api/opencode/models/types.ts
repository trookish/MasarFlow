/** Shared response payload shape for the models route. */
export interface OpenCodeModelsResponse {
  providers: {
    providerId: string;
    providerName: string;
    models: {
      id: string;
      name: string;
      capabilities: {
        reasoning: boolean;
        attachment: boolean;
        toolcall: boolean;
      };
    }[];
  }[];
}
