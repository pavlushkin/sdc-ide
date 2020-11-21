export const questionnaireExpected = {
    id: 'demo-1',
    resourceType: 'Questionnaire',
    status: 'active',
    mapping: [
        {
            id: 'demo-1',
            resourceType: 'Mapping',
        },
    ],
    launchContext: [
        {
            name: 'LaunchPatient',
            type: 'Patient',
            description: 'The patient that is to be used to pre-populate the form',
        },
    ],
    item: [
        {
            text: 'First Name',
            type: 'string',
            linkId: 'first-name',
            initialExpression: {
                language: 'text/fhirpath',
                expression: '%LaunchPatient.name.given.first()',
            },
        },
        {
            text: 'Middle Name',
            type: 'string',
            linkId: 'middle-name',
            initialExpression: {
                language: 'text/fhirpath',
                expression: '%LaunchPatient.name.given[1]',
            },
        },
        {
            text: 'Last Name',
            type: 'string',
            linkId: 'last-name',
            initialExpression: {
                language: 'text/fhirpath',
                expression: '%LaunchPatient.name.family.first()',
            },
        },
        {
            text: 'Date of Birth',
            type: 'date',
            linkId: 'date-of-birth',
            initialExpression: {
                language: 'text/fhirpath',
                expression: '%LaunchPatient.birthDate',
            },
        },
        {
            text: 'ID',
            type: 'string',
            hidden: true,
            linkId: 'patientId',
            initialExpression: {
                language: 'text/fhirpath',
                expression: '%LaunchPatient.id',
            },
        },
    ],
};
