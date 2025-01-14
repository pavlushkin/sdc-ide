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
import { isSuccess, notAsked, RemoteData, loading, success, isFailure } from 'aidbox-react/src/libs/remoteData';
import { formatError } from 'aidbox-react/src/utils/error';
import React, { useCallback, useEffect, useState } from 'react';
import _ from 'lodash';
import { init, useLaunchContext } from './launchContextHook';
import { getData, setData } from 'src/services/localStorage';
import { toast } from 'react-toastify';
import { MapperInfo } from 'src/components/ModalCreateMapper/types';

const prevActiveMappingId = getData('prevActiveMappingId');

export const idExtraction = (issue: OperationOutcomeIssue, resource: Questionnaire, error: OperationOutcome) => {
    if (
        issue.expression?.[0].slice(0, 21) === 'Questionnaire.mapping' &&
        issue.code === 'invalid' &&
        error.resourceType === 'OperationOutcome'
    ) {
        const index = +issue.expression[0].slice(22);
        if (resource.mapping?.[index] === undefined || resource.mapping?.[index]?.resourceType !== 'Mapping') {
            return;
        }
        return resource.mapping?.[index].id;
    }
};

export const updateQuestionnaire = (resource: Questionnaire, fhirMode: boolean) => {
    return service<unknown, OperationOutcome>({
        method: 'PUT',
        data: resource,
        url: `/${fhirMode ? 'fhir/' : ''}Questionnaire/${resource.id}`,
    });
};

export const showToast = (type: string, error?: OperationOutcome, index?: number) => {
    if (type === 'success') {
        toast.success('New mapper created');
    } else {
        toast.error(
            formatError(error, {
                mapping: { conflict: 'Please reload page' },
                format: (errorCode, errorDescription) =>
                    `An error occurred: ${
                        error?.issue[index as number]?.diagnostics || errorDescription
                    } (${errorCode}).`,
            }),
        );
    }
};

export function useMain(questionnaireId: string) {
    const [fhirMode, setFhirMode_] = useState<boolean>(getData('fhirMode'));

    const setFhirMode = useCallback((fhirMode: boolean) => {
        setFhirMode_(fhirMode);
        setData('fhirMode', fhirMode);
    }, []);
    const [launchContext, dispatch] = useLaunchContext();

    // Closing create mapping modal
    const createMappingDefault = {
        status: false,
        renamed: false,
    };

    const [closingCreateMapper, setClosingCreateMapper] = useState(createMappingDefault);
    const [questionnaireUpdateToggle, setQuestionnaireUpdateToggle] = useState(false);

    const closeModal = (status: 'save' | 'cancel', isRenamedMappingId?: boolean) => {
        if (status === 'save' && isRenamedMappingId !== undefined) {
            const createMapping = {
                status: true,
                renamed: isRenamedMappingId,
            };
            setClosingCreateMapper(createMapping);
        }
        if (status === 'cancel') {
            setQuestionnaireUpdateToggle(!questionnaireUpdateToggle);
        }
        setShowModal(false);
        setMapperInfoList([]);
    };

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
                const event = await init(response.data);
                dispatch(event);
            }
        }
        if (closingCreateMapper.status && closingCreateMapper.renamed) {
            setQuestionnaireUpdateToggle(!questionnaireUpdateToggle);
            setClosingCreateMapper(createMappingDefault);
        }
        return response;
    }, [questionnaireId, dispatch]);

    const saveNewMapping = (mappingIdList: string[], mapperInfoList: MapperInfo[]) => {
        mapperInfoList.map(async (info, index) => {
            if (!mappingIdList[index]) {
                return;
            }
            const indexMapperInfo = info.index;
            const indexOfMapper = info.indexOfMapper;
            const resource = info.resource;
            if (mappingIdList[index] && resource.mapping) {
                resource.mapping[indexOfMapper].id = mappingIdList[index];
            }
            const saveFHIRResourceResponse = await saveFHIRResource({
                resourceType: 'Mapping',
                id: mappingIdList[index],
                body: {},
            });
            if (isFailure(saveFHIRResourceResponse)) {
                showToast('error', saveFHIRResourceResponse.error, indexMapperInfo);
                return;
            }
            const serviceResponse = await updateQuestionnaire(resource, false); // TODO use right fhirMode
            if (isFailure(serviceResponse)) {
                showToast('error', serviceResponse.error, indexMapperInfo);
                return;
            }
            showToast('success');
            questionnaireManager.reload();
        });
    };

    // Questionnaire in FHIR format
    const [questionnaireFHIRRD] = useService(
        () =>
            service<Questionnaire>({
                method: 'GET',
                url: `/${fhirMode ? 'fhir/' : ''}Questionnaire/${questionnaireId}`,
            }),
        [questionnaireId, fhirMode, questionnaireUpdateToggle],
    );

    const [mapperInfoList, setMapperInfoList] = useState<MapperInfo[]>([]);
    const [showModal, setShowModal] = useState(false);

    const saveQuestionnaireFHIR = useCallback(
        async (resource: Questionnaire) => {
            const response = await updateQuestionnaire(resource, fhirMode);
            if (isSuccess(response)) {
                questionnaireManager.reload();
                return;
            }
            if (response.error.issue?.length > 0) {
                const mappingInfoList: MapperInfo[] = [];
                response.error.issue.map((issue, index) => {
                    const mappingId: string | null | undefined = idExtraction(issue, resource, response.error);
                    const indexOfMapper = Number(issue.expression?.[0].slice(22));
                    if (!mappingId) {
                        showToast('error', response.error, index);
                        return;
                    }
                    const mapperInfo: MapperInfo = { mappingId, resource, index, indexOfMapper };
                    mappingInfoList.push(mapperInfo);
                });
                if (mappingInfoList.length > 0) {
                    setMapperInfoList(mappingInfoList);
                    setShowModal(true);
                }
            } else {
                showToast('error', response.error);
            }
        },
        [fhirMode, questionnaireManager],
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
        showModal,
        saveNewMapping,
        closeModal,
        mapperInfoList,
    };
}
