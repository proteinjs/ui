import React from 'react';
import { Button, Container, Grid, IconButton, Typography, LinearProgress } from '@mui/material';
import queryString from 'query-string';
import { Field, FieldComponent, Fields } from './Field';
import { FormButton, FormButtons } from './FormButton';
import { withRouter, WithRouterProps } from '../router/withRouter';

export type FormProps<F extends Fields, B extends FormButtons<F>> = {
  name?: string;
  documentation?: React.ComponentType;
  createFields: () => F;
  fieldLayout?: (keyof F)[] | (keyof F)[][];
  buttons: B;
  onLoad?: (fields: F, buttons: B) => Promise<void>;
  onLoadProgressMessage?: string;
} & Partial<WithRouterProps>;

export type FormState<F extends Fields> = {
  status?: { message?: string; isError?: boolean };
  fields: F;
  progress?: { visible?: boolean; message?: string };
  onLoadExecuted?: boolean;
};

export class FormComponent<F extends Fields, B extends FormButtons<F>> extends React.Component<FormProps<F, B>, FormState<F>> {
  constructor(props: FormProps<F, B>) {
    super(props);
    this.state = { fields: props.createFields() };
  }

  componentDidMount() {
    if (this.state.onLoadExecuted) return;

    this.onLoad();
  }

  private async onLoad() {
    this.setState({ progress: { visible: true, message: this.props.onLoadProgressMessage } });
    const newFields = this.props.createFields();
    try {
      for (const fieldPropertyName in newFields) {
        const field = newFields[fieldPropertyName].field;
        if (!field) continue;

        if (field.onLoad) await field.onLoad(newFields);

        if (!field.accessibility) field.accessibility = {};
      }

      if (this.props.onLoad) await this.props.onLoad(newFields, this.props.buttons);
    } catch (error) {
      console.error('Failed while running onLoad functions', error);
    }

    this.setState({
      status: {},
      fields: newFields,
      progress: { visible: false },
      onLoadExecuted: true,
    });
  }

  private async onChange(field: Field<any, any>, value: any, setFieldStatus: (message: string, isError: boolean) => void) {
    field.value = value;
    if (field.onChange) {
      try {
        await field.onChange(field.value, this.state.fields, setFieldStatus);
      } catch (error) {
        console.error(`Failed while running onChange for field: ${field.name}`, error);
      }
    }

    this.setState(this.state);
  }

  private async onClick(button: FormButton<any>) {
    if (button.onClick) {
      this.setState({ progress: { visible: true, message: button.progressMessage ? button.progressMessage(this.state.fields) : undefined } });
      try {
        const successMessage = await button.onClick(this.state.fields, this.props.buttons);
        if (successMessage) this.setState({ status: { message: successMessage, isError: false } });
      } catch (error: any) {
        this.setState({ status: { message: error.message, isError: true } });
        console.error(`Error when clicking button: ${button.name}`, error);
      }
      this.setState({ progress: { visible: false } });
    }

    if (button.redirect) {
      const redirect = await button.redirect(this.state.fields, this.props.buttons);
      let path = redirect.path;
      if (redirect.props) path += `?${queryString.stringify(redirect.props)}`;

      if (this.props.navigate) this.props.navigate(path);

      return;
    }

    if (button.clearFormOnClick) await this.onLoad();
  }

  render() {
    return (
      <Container sx={{ padding: 0 }} maxWidth={this.getContainerMaxWidth()}>
        <form autoComplete='off'>
          <Grid container>
            {this.Title()}
            {this.Documentation()}
            {this.Status()}
            {this.Fields()}
            {this.Progress()}
            {this.Buttons()}
          </Grid>
        </form>
      </Container>
    );
  }

  private getContainerMaxWidth(): 'xs' | 'sm' {
    if (this.props.fieldLayout) {
      // TODO validate that fields are not hidden
      if (this.props.fieldLayout.length < 2) return 'xs';

      for (const row of this.props.fieldLayout) if ((row as string[]).length > 1) return 'sm';
    } else {
      const rows: boolean[] = [];
      for (const fieldPropertyName in this.state.fields) {
        const field = this.state.fields[fieldPropertyName].field;
        if (field.accessibility?.hidden) continue;

        if (!field.layout) continue;

        if (rows[field.layout.row]) return 'sm';

        rows[field.layout.row] = true;
      }
    }

    return 'xs';
  }

  private Title() {
    if (!this.props.name) return null;

    return (
      <Grid
        container
        xs={12}
        justifyContent='flex-start'
        alignItems='flex-start'
        sx={(theme) => ({
          marginTop: theme.spacing(1),
          marginBottom: theme.spacing(3),
        })}
      >
        <Typography variant='h5'>{this.props.name}</Typography>
      </Grid>
    );
  }

  private Documentation() {
    if (!this.props.documentation) return null;

    return (
      <Grid container xs={12} justifyContent='flex-start' alignItems='flex-start'>
        <Container>
          <this.props.documentation />
        </Container>
      </Grid>
    );
  }

  private Status() {
    if (!this.state.status || !this.state.status.message) return null;

    return (
      <Grid container xs={12}>
        <Container
          sx={(theme) => ({
            marginBottom: theme.spacing(1),
          })}
        >
          <Typography variant='subtitle1' color={this.state.status.isError ? 'error' : 'primary'}>
            {this.state.status.message}
          </Typography>
        </Container>
      </Grid>
    );
  }

  private Fields() {
    return (
      <Grid container direction='column' xs={12}>
        {this.getFieldRows().map((fieldComponents, index) => {
          if (!this.isFieldRowVisible(fieldComponents)) return null;

          return (
            <Grid
              container
              spacing={3}
              alignItems='center'
              sx={(theme) => ({
                flexGrow: 1,
                marginBottom: theme.spacing(3),
              })}
              key={index}
            >
              {fieldComponents
                .filter((fieldComponent) => {
                  if (fieldComponent.field.accessibility?.hidden) return false;

                  return true;
                })
                .map((fieldComponent) => (
                  <Grid item xs key={fieldComponent.field.name}>
                    <fieldComponent.component field={fieldComponent.field} onChange={this.onChange.bind(this)} />
                  </Grid>
                ))}
            </Grid>
          );
        })}
      </Grid>
    );
  }

  private getFieldRows(): FieldComponent<any, any>[][] {
    const rows: FieldComponent<any, any>[][] = [];
    if (!this.state.fields) return rows;

    if (this.props.fieldLayout) {
      if (typeof this.props.fieldLayout[0] === 'string') {
        for (let i = 0; i < this.props.fieldLayout.length; i++) {
          const fieldPropertyName = this.props.fieldLayout[i] as string;
          const fieldComponent = this.state.fields[fieldPropertyName];
          fieldComponent.field.layout = { row: i, width: 12 };
          rows.push([fieldComponent]);
        }
      } else {
        for (let i = 0; i < this.props.fieldLayout.length; i++) {
          const row = this.props.fieldLayout[i] as string[];
          const columns = row.length;
          if (columns > 6) throw new Error(`When using FormProps.fieldLayout, the maximum number of fields per row is 6, provided: ${columns}. For more granular layout control use Field.layout`);

          const currentRow: FieldComponent<any, any>[] = [];
          for (const fieldPropertyName of row) {
            const fieldComponent = this.state.fields[fieldPropertyName];
            fieldComponent.field.layout = { row: i, width: columns == 5 ? 2 : ((12 / columns) as 1) };
            currentRow.push(fieldComponent);
          }
          rows.push(currentRow);
        }
      }
    } else {
      for (const fieldPropertyName in this.state.fields) {
        const fieldComponent: FieldComponent<any, any> = this.state.fields[fieldPropertyName];
        const field = fieldComponent.field;
        if (!field.layout) throw new Error(`Unless using FormProps.fieldLayout, Field.layout must be provided; layout not provided for field: ${field.name}`);

        if (typeof rows[field.layout.row] === 'undefined') rows[field.layout.row] = [];

        if (field.layout.column && rows[field.layout.row].length >= field.layout.column) rows[field.layout.row].splice(field.layout.column - 1, 0, fieldComponent);
        else rows[field.layout.row].push(fieldComponent);

        const rowWidth = rows[field.layout.row]
          .map((fieldComponent) => (fieldComponent.field.layout?.width ? (fieldComponent.field.layout.width as number) : 0))
          .reduce((accumulator, currentWidth) => accumulator + currentWidth);
        if (rowWidth > 12) throw new Error(`Width of row exceeds maximum width (12), row width: ${rowWidth}, row index: ${field.layout.row}`);
      }
    }

    return rows;
  }

  private isFieldRowVisible(fieldComponents: FieldComponent<any, any>[]): boolean {
    for (const fieldComponent of fieldComponents) if (!fieldComponent.field.accessibility || !fieldComponent.field.accessibility?.hidden) return true;

    return false;
  }

  private Progress() {
    if (!this.state.progress || !this.state.progress.visible) return null;

    return (
      <Grid container xs={12} justifyContent='center' alignItems='center' spacing={2}>
        <Container>
          <LinearProgress variant='indeterminate' color='primary' />
        </Container>
      </Grid>
    );
  }

  private Buttons() {
    return (
      <Grid
        container
        direction='row'
        justifyContent='flex-end'
        alignItems='center'
        xs={12}
        sx={(theme) => ({
          marginTop: theme.spacing(2),
          marginBottom: theme.spacing(1),
        })}
      >
        {Object.keys(this.props.buttons)
          .map((buttonPropertyName) => this.props.buttons[buttonPropertyName])
          .filter((button) => {
            if (button.accessibility?.hidden) return false;

            return true;
          })
          .map((button, key) => {
            return (
              <Grid
                key={key}
                sx={(theme) => ({
                  marginLeft: theme.spacing(1),
                })}
              >
                {button.style.icon ? (
                  <IconButton disabled={button.accessibility?.disabled} onClick={(event: any) => this.onClick(button)}>
                    <button.style.icon />
                  </IconButton>
                ) : (
                  <Button
                    color={button.style.color}
                    variant={button.style.variant ? button.style.variant : 'contained'}
                    disabled={button.accessibility?.disabled}
                    onClick={(event) => this.onClick(button)}
                  >
                    {button.name}
                  </Button>
                )}
              </Grid>
            );
          })}
      </Grid>
    );
  }
}

type FormType = <F extends Fields, B extends FormButtons<F>>(props: Omit<FormProps<F, B>, 'classes'>) => JSX.Element;
export const Form = withRouter(FormComponent) as FormType;
