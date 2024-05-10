// import React from 'react';
// import { Button, Container, Grid, IconButton, Typography, LinearProgress } from '@material-ui/core';
// import { makeStyles, styled } from '@material-ui/core/styles';
// import { compose, sizing, spacing } from '@material-ui/system';
// import queryString from 'query-string';
// import { history } from '../util/history';
// import { Field, FieldComponent, Fields } from './Field';
// import { FormButton, FormButtons } from './FormButton';

// const useStyles = makeStyles(theme => ({
// 	root: {
// 		padding: 0
// 	},
// 	title: {
// 		marginBottom: theme.spacing(4),
// 	},
// 	status: {
// 		marginBottom: theme.spacing(2)
// 	},
// 	button: {
// 		margin: theme.spacing(6, 0, 2),
// 	}
// }));

// export const RootBox = styled('div')(
// 	compose(
// 		sizing,
// 		spacing
// 	)
// );

// export type FormProps<F extends Fields, B extends FormButtons<F>> = {
//     name?: string,
//     documentation?: React.ComponentType,
//     createFields: () => F,
//     fieldLayout?: (keyof F)[]|(keyof F)[][],
//     buttons: B,
//     onLoad?: (fields: F, buttons: B) => Promise<void>,
//     onLoadProgressMessage?: string
// }

// export function Form<F extends Fields, B extends FormButtons<F>>(props: FormProps<F, B>) {
//     const classes = useStyles(props);
//     const [status, setStatus] = React.useState<{ message?: string, isError?: boolean }>();
//     const [fields, setFields] = React.useState<F>();
//     const [progress, setProgress] = React.useState<{ visible?: boolean, message?: string }>();
//     const [fieldRenderKeys, setFieldRenderKeys] = React.useState<{[fieldName: string]: number}>({});
//     // const [fieldRenderKeys, dispatchFieldRenderKeys] = React.useReducer((state: {[fieldName: string]: number}, action: any) => {
//     // //    const counter = typeof state[action.field] !== 'undefined' ? state[action.field] + 1 : 1;
//     // //    const fieldUpdate: any = {};
//     // //    fieldUpdate[action.field] = counter;
//     // //    return Object.assign(state, fieldUpdate);
//     //     state[action.field] = typeof state[action.field] !== 'undefined' ? state[action.field] + 1 : 1;
//     //     return Object.assign({}, state);
//     // }, {});
//     const [renderFields, setRenderFields] = React.useState(0);
//     const [focusedField, setFocusedField] = React.useState<string>();
//     React.useEffect(() => {
//         onLoad();
//     }, []);

//     async function onLoad() {
//         setProgress({ visible: true, message: props.onLoadProgressMessage });
//         const newFields = props.createFields();
//         try {
//             for (const fieldPropertyName in newFields) {
//                 const field = newFields[fieldPropertyName].field;
//                 if (!field)
//                     continue;

//                 if (field.onLoad)
//                     await field.onLoad(newFields);

//                 if (!field.accessibility)
//                     field.accessibility = {};
//                 Object.defineProperty(field.accessibility, 'required', {
//                     get: function() {
//                         return this._required;
//                     },
//                     set: function(value) {
//                         console.log(`running set value for field: ${field.name}`);
//                         // const renderKeyUpdate: any = {};
//                         // renderKeyUpdate[field.name] = typeof renderKeyUpdate[field.name] !== 'undefined' ? renderKeyUpdate[field.name] + 1 : 1;
//                         // setFieldRenderKeys(Object.assign(fieldRenderKeys, renderKeyUpdate));
//                         fieldRenderKeys[field.name] = typeof fieldRenderKeys[field.name] !== 'undefined' ? fieldRenderKeys[field.name] + 1 : 1;
//                         setFieldRenderKeys(Object.assign({}, fieldRenderKeys));
//                         // dispatchFieldRenderKeys({ field: field.name });
//                         // if (typeof fieldRenderKeys[field.name] !== 'number')
//                         //     fieldRenderKeys[field.name] = 0;

//                         // fieldRenderKeys[field.name] = fieldRenderKeys[field.name] + 1;
//                         this._required = value;
//                     }
//                 });
//             }

//             if (props.onLoad)
//                 await props.onLoad(newFields, props.buttons);
//         } catch (error) {
//             console.error(`Failed while running onLoad functions`, error);
//         }

//         setStatus({});
//         setFields(newFields);
//         setProgress({ visible: false });
//     }

//     async function onChange(field: Field<any, any>, value: any, setFieldStatus: (message: string, isError: boolean) => void) {
//         field.value = value;
//         if (field.onChange) {
//             try {
//                 await field.onChange(field.value, fields, setFieldStatus);
//             } catch (error) {
//                 console.error(`Failed while running onChange for field: ${field.name}`, error);
//             }
//         }

//         setFocusedField(field.name);
//         // setFields(Object.assign({}, fields));
//         // setFieldRenderKeys(Object.assign({}, fieldRenderKeys));
//         // dispatchFieldRenderKeys({ type: 'update' })
//         // setRenderFields(renderFields +1);
//     }

//     async function onClick(button: FormButton<any>) {
//         if (button.onClick) {
//             setProgress({ visible: true, message: button.progressMessage ? button.progressMessage(fields) : undefined });
//             try {
//                 const successMessage = await button.onClick(fields, props.buttons);
//                 if (successMessage)
//                     setStatus({ message: successMessage, isError: false});
//             } catch (error) {
//                 setStatus({ message: error.message, isError: true});
//                 console.error(`Error when clicking button: ${button.name}`, error);
//             }
//             setProgress({ visible: false });
//         }

//         if (button.redirect) {
//             let path = button.redirect.path;
//             if (button.redirect.props)
//                 path += `?${queryString.stringify(button.redirect.props)}`;
//             history.push(path);
//             return;
//         }

//         if (button.clearFormOnClick)
//             await onLoad();
//     }

//     return (
//         <Container>
//             <form autoComplete='off'>
//                 <Title />
//                 <Documentation />
//                 <Status />
//                 <Fields />
//                 <Progress />
//                 <Buttons />
//             </form>
//         </Container>
//     );

//     function Title() {
//         if (!props.name)
//             return null;

//         return (
//             <Grid container justify='flex-start' alignItems='flex-start' spacing={2}>
//                 <Grid item>
//                     <Typography variant='h5' className={classes.title}>
//                         {props.name}
//                     </Typography>
//                 </Grid>
//             </Grid>
//         );
//     }

//     function Documentation() {
//         if (!props.documentation)
// 			return null;

// 		return (
//             <Grid container justify='flex-start' alignItems='flex-start'>
//                 <Grid item>
//                     <props.documentation />
//                 </Grid>
//             </Grid>
// 		);
//     }

//     function Status() {
//         if (!status || !status.message)
//             return null;

//         return (
//             <Grid container>
// 				<Grid item xs={12} className={classes.status}>
// 					<Typography
// 						variant='subtitle1'
// 						color={status.isError ? 'error' : 'primary'}
// 					>
// 						{status.message}
// 					</Typography>
// 				</Grid>
// 			</Grid>
//         );
//     }

//     function Fields() {
//         return (
//             <Grid container spacing={8}>
//                 {
//                     getFieldRows().map((fieldComponents, index) => {
//                         if (!fieldRowVisible(fieldComponents))
//                             return null;

//                         return (
//                             <Grid item xs={12} key={index}>
//                                 <Grid container spacing={8}>
//                                     {
//                                         fieldComponents.filter((fieldComponent) => {
//                                             if (fieldComponent.field.accessibility?.hidden)
//                                                 return false;

//                                             return true;
//                                         }).map((fieldComponent, key) => {
//                                             const fieldKey = fieldRenderKeys[fieldComponent.field.name] ? `${fieldComponent.field.name}_${fieldRenderKeys[fieldComponent.field.name]}` : `${fieldComponent.field.name}`;
//                                             console.log(fieldKey);
//                                             return (
//                                             <Grid item xs={12} sm={fieldComponent.field.layout?.width as 1} key={fieldRenderKeys[fieldComponent.field.name] ? `${fieldComponent.field.name}_${fieldRenderKeys[fieldComponent.field.name]}` : `${fieldComponent.field.name}`}>
//                                                 <fieldComponent.component
//                                                     field={fieldComponent.field}
//                                                     onChange={onChange}
//                                                     // focused={focusedField == fieldComponent.field.name}
//                                                 />
//                                             </Grid>
//                                         )})
//                                     }
//                                 </Grid>
//                             </Grid>
//                         );
//                     })
//                 }
//             </Grid>
//         );
//     }

//     function getFieldRows(): FieldComponent<any, any>[][] {
//         const rows: FieldComponent<any, any>[][] = [];
//         if (!fields)
//             return rows;

//         if (props.fieldLayout) {
//             if (typeof props.fieldLayout[0] === 'string') {
//                 for (let i = 0; i < props.fieldLayout.length; i++) {
//                     const fieldPropertyName = props.fieldLayout[i] as string;
//                     const fieldComponent = fields[fieldPropertyName];
//                     fieldComponent.field.layout = { row: i, width: 12 };
//                     rows.push([fieldComponent]);
//                 }
//             } else {
//                 for (let i = 0; i < props.fieldLayout.length; i++) {
//                     const row = props.fieldLayout[i] as string[];
//                     const columns = row.length;
//                     if (columns > 6)
//                         throw new Error(`When using FormProps.fieldLayout, the maximum number of fields per row is 6, provided: ${columns}. For more granular layout control use Field.layout`);

//                     const currentRow: FieldComponent<any, any>[] = [];
//                     for (const fieldPropertyName of row ) {
//                         const fieldComponent = fields[fieldPropertyName];
//                         fieldComponent.field.layout = { row: i, width: columns == 5 ? 2 : 12/columns as 1 };
//                         currentRow.push(fieldComponent);
//                     }
//                     rows.push(currentRow);
//                 }
//             }
//         } else {
//             for (const fieldPropertyName in fields) {
//                 const fieldComponent: FieldComponent<any, any> = fields[fieldPropertyName];
//                 const field = fieldComponent.field;
//                 if (!field.layout)
//                     throw new Error(`Unless using FormProps.fieldLayout, Field.layout must be provided; layout not provided for field: ${field.name}`);

//                 if (typeof rows[field.layout.row] === 'undefined')
//                     rows[field.layout.row] = [];

//                 if (field.layout.column && rows[field.layout.row].length >= field.layout.column) {
//                     rows[field.layout.row].splice(field.layout.column - 1, 0, fieldComponent);
//                 } else
//                     rows[field.layout.row].push(fieldComponent);

//                 const rowWidth = rows[field.layout.row].map((fieldComponent) => fieldComponent.field.layout?.width ? fieldComponent.field.layout.width as number : 0).reduce((accumulator, currentWidth) => accumulator + currentWidth);
//                 if (rowWidth > 12)
//                     throw new Error(`Width of row exceeds maximum width (12), row width: ${rowWidth}, row index: ${field.layout.row}`);
//             }
//         }

// 		return rows;
//     }

//     function fieldRowVisible(fieldComponents: FieldComponent<any, any>[]): boolean {
// 		for (const fieldComponent of fieldComponents) {
// 			if (!fieldComponent.field.accessibility || !fieldComponent.field.accessibility?.hidden)
// 				return true;
// 		}

// 		return false;
//     }

//     function Progress() {
//         if (!progress || !progress.visible)
//             return null;

//         return (
//             <Grid container justify='center' alignItems='center' spacing={2}>
//                 <Grid item>
//                     <LinearProgress variant='indeterminate' color='primary' />
//                 </Grid>
//             </Grid>
//         );
//     }

//     function Buttons() {
//         return (
//             <Grid container justify='flex-end' alignItems='flex-end' spacing={2}>
//                 {
//                     Object.keys(props.buttons).map((buttonPropertyName) => props.buttons[buttonPropertyName]).filter((button) => {
//                         if (button.accessibility?.hidden)
//                             return false;

//                         return true;
//                     }).map((button, key) => {
//                         return (
//                             <Grid item key={key}>
//                                 { button.style.icon ?
//                                     <RootBox className={classes.button}>
//                                         <IconButton
//                                             disabled={button.accessibility?.disabled}
//                                             onClick={event => onClick(button)}
//                                         >
//                                             <button.style.icon />
//                                         </IconButton>
//                                     </RootBox>
//                                     :
//                                     <RootBox className={classes.button}>
//                                         <Button
//                                             color={button.style.color}
//                                             variant={button.style.variant ? 'contained' : 'text'}
//                                             disabled={button.accessibility?.disabled}
//                                             onClick={event => onClick(button)}
//                                         >
//                                             {button.name}
//                                         </Button>
//                                     </RootBox>
//                                 }
//                             </Grid>
//                         )
//                     })
//                 }
//             </Grid>
//         );
//     }
// }
