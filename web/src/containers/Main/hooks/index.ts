import { useService } from 'aidbox-react/src/hooks/service';
import { getFHIRResource, saveFHIRResource } from 'aidbox-react/src/services/fhir';
import {
    Bundle,
    Mapping,
    OperationOutcome,
    OperationOutcomeIssue,
    Questionnaire,
    QuestionnaireResponse,
    Reference,
} from 'shared/src/contrib/aidbox';
import { service, sequenceMap } from 'aidbox-react/src/services/service';
import { isSuccess, notAsked, RemoteData, loading, success } from 'aidbox-react/src/libs/remoteData';
import { formatError } from 'aidbox-react/src/utils/error';
import React, { useCallback, useEffect, useState } from 'react';
import _ from 'lodash';
import { init, useLaunchContext } from './launchContextHook';
import { getData, setData } from 'src/services/localStorage';
import { toast } from 'react-toastify';

const prevActiveMappingId = getData('prevActiveMappingId');

export function useMain(questionnaireId: string) {
    const [fhirMode, setFhirMode_] = useState<boolean>(getData('fhirMode'));

    const setFhirMode = useCallback((fhirMode: boolean) => {
        setFhirMode_(fhirMode);
        setData('fhirMode', fhirMode);
    }, []);
    const [launchContext, dispatch] = useLaunchContext();
    // Questionnaire
    const [questionnaireRD, questionnaireManager] = useService(async () => {
        const response = await service<Questionnaire>({
            method: 'GET',
            url: `Questionnaire/${questionnaireId}/$assemble`,
        });

        if (isSuccess(response)) {
            const mappings = response.data.mapping || [];
            const sortedMappings = _.sortBy(mappings, 'id');
            setMappingList(sortedMappings);
            const firstMapping = sortedMappings.length ? sortedMappings[0] : undefined;
            if (prevActiveMappingId && !_.isEmpty(_.filter(sortedMappings, { id: prevActiveMappingId }))) {
                setActiveMappingId(prevActiveMappingId);
            } else {
                setData('prevActiveMappingId', null);
                setActiveMappingId(firstMapping?.id);
            }

            if (launchContext) {
                dispatch(await init(response.data));
            }
        }

        return response;
    }, [questionnaireId, dispatch]);

    // Questionnaire in FHIR format
    const [questionnaireFHIRRD] = useService(
        () =>
            service<Questionnaire>({
                method: 'GET',
                url: `/${fhirMode ? 'fhir/' : ''}Questionnaire/${questionnaireId}`,
            }),
        [questionnaireId, fhirMode],
    );

    const showModal = (response: any, type: string) => {
        if (type === 'success') {
            toast.success('New mapper created');
        } else {
            toast.error(
                formatError(response.error, {
                    mapping: { conflict: 'Please reload page' },
                    format: (errorCode, errorDescription) =>
                        `An error occurred: ${errorDescription} (${errorCode}). Please reach tech support`,
                }),
            );
        }
    };

    const idExtraction = useCallback((item: OperationOutcomeIssue, resource: Questionnaire, response: any) => {
        if (
            item.expression &&
            item.expression[0].slice(0, 21) === 'Questionnaire.mapping' &&
            item.code === 'invalid' &&
            response.error.resourceType === 'OperationOutcome'
        ) {
            const index = +item.expression[0].slice(22);
            if (
                (resource.mapping && resource.mapping[index] === undefined) ||
                (resource.mapping && resource.mapping[index] && resource.mapping[index].resourceType !== 'Mapping')
            ) {
                showModal(response, 'error');
                return;
            }
            return resource.mapping && resource.mapping[index].id;
        } else {
            showModal(response, 'error');
        }
    }, []);

    const saveQuestionnaireFHIR = useCallback(
        async (resource: Questionnaire) => {
            const response = await service<unknown, OperationOutcome>({
                method: 'PUT',
                data: resource,
                url: `/${fhirMode ? 'fhir/' : ''}Questionnaire/${resource.id}`,
            });
            if (isSuccess(response)) {
                questionnaireManager.reload();
                return;
            }
            if (response.error.issue && response.error.issue.length > 0) {
                response.error.issue.map(async (item) => {
                    const mappingId = idExtraction(item, resource, response);
                    if (mappingId) {
                        try {
                            await saveFHIRResource({ resourceType: 'Mapping', id: mappingId, body: {} });
                            await service<unknown, OperationOutcome>({
                                method: 'PUT',
                                data: resource,
                                url: `/${fhirMode ? 'fhir/' : ''}Questionnaire/${resource.id}`,
                            });
                            showModal({}, 'success');
                            questionnaireManager.reload();
                        } catch (error) {
                            showModal(error, 'error');
                        }
                    }
                });
            } else {
                showModal(response, 'error');
            }
        },
        [fhirMode, questionnaireManager, idExtraction],
    );

    // QuestionnaireResponse
    const [questionnaireResponseRD, setQuestionnaireResponseRD] = useState<RemoteData<QuestionnaireResponse>>(loading);

    const loadQuestionnaireResponse = useCallback(async () => {
        setQuestionnaireResponseRD(notAsked);
        if (isSuccess(questionnaireRD)) {
            const response = await service<QuestionnaireResponse>({
                method: 'POST',
                url: '/Questionnaire/$populate',
                data: launchContext,
            });
            setQuestionnaireResponseRD(response);
        }
    }, [launchContext, questionnaireRD]);

    const saveQuestionnaireResponse = useCallback(
        (resource: QuestionnaireResponse) => {
            if (isSuccess(questionnaireResponseRD)) {
                if (!_.isEqual(resource, questionnaireResponseRD.data)) {
                    setQuestionnaireResponseRD(success(resource));
                }
            }
        },
        [questionnaireResponseRD],
    );

    useEffect(() => {
        (async () => {
            if (isSuccess(questionnaireRD)) {
                await loadQuestionnaireResponse();
            } else {
                setQuestionnaireResponseRD(questionnaireRD);
            }
        })();
    }, [questionnaireRD, loadQuestionnaireResponse]);

    // MappingList
    const [mappingList, setMappingList] = useState<Array<Reference<Mapping>>>([]);

    // Active mapping id
    const [activeMappingId, setActiveMappingId_] = useState<string | undefined>();
    const setActiveMappingId = useCallback((id: string | undefined) => {
        setActiveMappingId_(id);
        setData('prevActiveMappingId', id ?? null);
    }, []);

    // Mapping
    const [mappingRD, setMappingRD] = useState<RemoteData<Mapping>>(notAsked);

    const loadMapping = useCallback(async () => {
        const response = await getFHIRResource<Mapping>({
            resourceType: 'Mapping',
            id: activeMappingId!,
        });
        setMappingRD(response);
    }, [activeMappingId]);

    useEffect(() => {
        (async () => {
            if (activeMappingId) {
                await loadMapping();
            }
        })();
    }, [activeMappingId, loadMapping]);

    const saveMapping = useCallback(
        async (mapping: Mapping) => {
            if (isSuccess(mappingRD)) {
                if (!_.isEqual(mapping, mappingRD.data)) {
                    const response = await saveFHIRResource(mapping);
                    if (isSuccess(response)) {
                        await loadMapping();
                    }
                }
            }
        },
        [loadMapping, mappingRD],
    );

    // BatchRequest
    const [batchRequestRD, setBatchRequestRD] = React.useState<RemoteData<Bundle<any>>>(notAsked);

    useEffect(() => {
        (async function () {
            if (activeMappingId && isSuccess(questionnaireResponseRD)) {
                const response = await service({
                    method: 'POST',
                    url: `/Mapping/${activeMappingId}/$debug`,
                    data: questionnaireResponseRD.data,
                });
                setBatchRequestRD(response);
            }
        })();
    }, [questionnaireResponseRD, activeMappingId, mappingRD]);

    // Mapping apply
    const applyMappings = useCallback(async () => {
        const resourcesRD = sequenceMap({
            questionnaireRD,
            questionnaireResponseRD,
        });
        if (isSuccess(resourcesRD)) {
            const response = await service({
                method: 'POST',
                url: '/Questionnaire/$extract',
                data: {
                    ...launchContext,
                    parameter: [
                        {
                            name: 'QuestionnaireResponse',
                            resource: resourcesRD.data.questionnaireResponseRD,
                        },
                        ...launchContext.parameter,
                    ],
                },
            });
            if (isSuccess(response)) {
                window.location.reload();
            } else {
                alert('Extraction error, please check console for more details');
                console.log(JSON.stringify(response.error, undefined, 4));
            }
        }
    }, [launchContext, questionnaireRD, questionnaireResponseRD]);

    return {
        questionnaireRD,
        questionnaireFHIRRD,
        idExtraction,
        saveQuestionnaireFHIR,
        questionnaireResponseRD,
        saveQuestionnaireResponse,
        mappingList,
        activeMappingId,
        setActiveMappingId,
        mappingRD,
        saveMapping,
        batchRequestRD,
        applyMappings,
        setFhirMode,
        fhirMode,
        launchContext,
        dispatch,
    };
}
