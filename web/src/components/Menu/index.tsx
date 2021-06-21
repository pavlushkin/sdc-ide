import React, { Dispatch } from 'react';
import _ from 'lodash'

import { ResourceSelect, RemoteResourceSelect } from 'src/components/ResourceSelect';
import { useMenu } from 'src/components/Menu/hooks';

import s from './Menu.module.scss';
import { Arrow } from 'src/components/Icon/Arrow';
import { RemoteData } from 'aidbox-react/src/libs/remoteData';
import { Questionnaire, QuestionnaireLaunchContext, Parameters, Resource } from 'shared/src/contrib/aidbox';
import { RenderRemoteData } from 'aidbox-react/src/components/RenderRemoteData';
import { Action, setResource } from 'src/containers/Main/hooks/launchContextHook';

interface MenuProps {
    launchContext: Parameters;
    dispatch: Dispatch<Action>
    questionnaireId: string;
    questionnaireRD: RemoteData<Questionnaire>;
    fhirMode: boolean;
    setFhirMode: (flag: boolean) => void;
}

export function Menu({ questionnaireId, fhirMode, setFhirMode, questionnaireRD, launchContext, dispatch }: MenuProps) {
    const { toggleMenu, getMenuStyle, questionnairesRD, direction, configForm } = useMenu();
    return (
        <>
            <div className={s.control} onClick={toggleMenu}>
                <span className={s.symbol}>
                    <Arrow direction={direction} fill="white" />
                </span>
            </div>
            <div className={s.box} style={getMenuStyle}>
                <div className={s.menuItem}>Questionnaire</div>
                <div className={s.menuItem}>
                    <ResourceSelect
                        value={questionnaireId}
                        bundleResponse={questionnairesRD}
                        onChange={(id) => {
                            window.location.hash = id;
                        }}
                        display={({ id }) => id!}
                    />
                </div>
                <RenderRemoteData remoteData={questionnaireRD}>
                    {(questionnaire) =>
                        <EditLaunchContext
                            parameters={launchContext}
                            launchContext={questionnaire.launchContext ?? []}
                            dispatch={dispatch}
                        />}
                </RenderRemoteData>
                <div className={s.menuItem}>
                    <label htmlFor="fhir-mode">FhirMode</label>
                </div>
                <div className={s.menuItem}>
                    <input
                        name="fhir-mode"
                        type="checkbox"
                        checked={fhirMode}
                        onChange={() => setFhirMode(!fhirMode)}
                    />
                </div>
                <div className={s.menuItem} />
                <div className={s.menuItem} />
                <div className={s.menuItem}>
                    <b>Config</b>
                </div>
                <div className={s.menuItem} />
                <div className={s.menuItem}>
                    <label>Base URL</label>
                </div>
                <div className={s.menuItem}>
                    <input value={configForm.baseUrl} onChange={(e) => configForm.setBaseUrl(e.target.value)} />
                </div>
                <div className={s.menuItem}>
                    <label>Username</label>
                </div>
                <div className={s.menuItem}>
                    <input value={configForm.username} onChange={(e) => configForm.setUsername(e.target.value)} />
                </div>
                <div className={s.menuItem}>
                    <label>Password</label>
                </div>
                <div className={s.menuItem}>
                    <input value={configForm.password} onChange={(e) => configForm.setPassword(e.target.value)} />
                </div>
                <div className={s.menuItem} />
                <div className={s.menuItem}>
                    <button onClick={configForm.applyConfig}>Apply config</button>
                </div>
            </div>
        </>
    );
}

interface LaunchContextProps {
    launchContext: QuestionnaireLaunchContext[];
    parameters: Parameters;
    dispatch: Dispatch<Action>
}

function EditLaunchContext({ launchContext, parameters, dispatch }: LaunchContextProps) {
    return (
        <>
            {launchContext.map((l) => {
                return (
                    <LaunchContextElement
                        launchContext={l}
                        value={_.find(parameters.parameter, {name: l.name})?.resource}
                        onChange={(resource) => dispatch(setResource({name: l.name!, resource: resource! }))}
                    />
                );
            })}
        </>
    );
}

interface LaunchContextElementProps {
    launchContext: QuestionnaireLaunchContext;
    value: Resource | null | undefined
    onChange: (r: Resource | null | undefined) => void
}

function LaunchContextElement({ launchContext, value, onChange }: LaunchContextElementProps) {
    return (
        <>
            <div className={s.menuItem}>
                {launchContext.name}
                <br />
                <span>{launchContext.description}</span>
            </div>
            <div className={s.menuItem}>
                <RemoteResourceSelect
                    resourceType={launchContext.type as any}
                    value={value}
                    onChange={onChange}
                />
            </div>
        </>
    );
}

/* <div className={s.menuItem}>Patient</div>
 * <div className={s.menuItem}>
 * <ResourceSelect
 * cssClass={s.resourceSelect}
 * value={patientId}
 * bundleResponse={patientsRD}
 * onChange={setPatientId}
 * display={getPatientFullName}
 * />
 * </div> */
