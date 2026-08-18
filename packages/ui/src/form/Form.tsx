import React from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Grid,
  IconButton,
  Typography,
  LinearProgress,
  Snackbar,
  Stack,
} from '@mui/material';
import queryString from 'query-string';
import { Field, FieldComponent, Fields } from './Field';
import { FormButton, FormButtons } from './FormButton';
import { withRouter, WithRouterProps } from '../router/withRouter';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { useFormFactor } from '../hooks/useFormFactor';

export type FormProps<F extends Fields, B extends FormButtons<F>> = {
  name?: string;
  documentation?: React.ComponentType;
  createFields: () => F;
  fieldLayout?: (keyof F)[] | (keyof F)[][];
  buttons: B;
  onLoad?: (fields: F, buttons: B) => Promise<void>;
  onLoadProgressMessage?: string;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  /** Injected by the exported wrapper (MOBILE_SUPPORT S1) — the phone-layout fork. */
  isPhone?: boolean;
} & Partial<WithRouterProps>;

export type FormState<F extends Fields> = {
  status?: { message?: string; isError?: boolean };
  fields: F;
  progress?: { visible?: boolean; message?: string };
  onLoadExecuted?: boolean;
  /** True while a button's action is executing; buttons are disabled so a click acts exactly once. */
  actionInFlight?: boolean;
  /** Button whose `confirm` dialog is currently open; its action runs only on confirm. */
  pendingConfirmationButton?: FormButton<F>;
};

export class FormComponent<F extends Fields, B extends FormButtons<F>> extends React.Component<
  FormProps<F, B>,
  FormState<F>
> {
  constructor(props: FormProps<F, B>) {
    super(props);
    this.state = { fields: props.createFields() };
  }

  componentDidMount() {
    if (this.state.onLoadExecuted) {
      return;
    }

    this.onLoad();
  }

  private async onLoad() {
    this.setState({ progress: { visible: true, message: this.props.onLoadProgressMessage } });
    const newFields = this.props.createFields();
    try {
      for (const fieldPropertyName in newFields) {
        const field = newFields[fieldPropertyName].field;
        if (!field) {
          continue;
        }

        if (field.onLoad) {
          await field.onLoad(newFields);
        }

        if (!field.accessibility) {
          field.accessibility = {};
        }
      }

      if (this.props.onLoad) {
        await this.props.onLoad(newFields, this.props.buttons);
      }
    } catch (error) {
      console.error(`Failed while running onLoad functions`, error);
    }

    this.setState({
      status: {},
      fields: newFields,
      progress: { visible: false },
      onLoadExecuted: true,
    });
  }

  private async onChange(
    field: Field<any, any>,
    value: any,
    setFieldStatus: (message: string, isError: boolean) => void
  ) {
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
    if (button.confirm) {
      this.setState({ pendingConfirmationButton: button });
      return;
    }

    await this.executeButtonAction(button);
  }

  private async executeButtonAction(button: FormButton<any>) {
    // Single owner of the double-submit guard: whether a click comes straight from a button or
    // through the confirmation dialog, an action only starts when none is in flight.
    if (this.state.actionInFlight) {
      return;
    }

    this.setState({ actionInFlight: true });
    try {
      if (button.onClick) {
        this.setState({
          progress: {
            visible: true,
            message: button.progressMessage ? button.progressMessage(this.state.fields) : undefined,
          },
        });
        try {
          const successMessage = await button.onClick(this.state.fields, this.props.buttons);
          if (successMessage) {
            this.setState({ status: { message: successMessage, isError: false } });
          }
        } catch (error: any) {
          this.setState({ status: { message: error.message, isError: true } });
          console.error(`Error when clicking button: ${button.name}`, error);
        }
        this.setState({ progress: { visible: false } });
      }

      if (button.redirect) {
        const redirect = await button.redirect(this.state.fields, this.props.buttons);
        let path = redirect.path;
        if (redirect.props) {
          path += `?${queryString.stringify(redirect.props)}`;
        }

        if (this.props.navigate) {
          this.props.navigate(path);
        }

        return;
      }

      if (button.clearFormOnClick) {
        await this.onLoad();
      }
    } finally {
      this.setState({ actionInFlight: false });
    }
  }

  render() {
    return (
      <Container sx={{ padding: 0 }} maxWidth={this.props.maxWidth || this.getContainerMaxWidth()}>
        <form autoComplete='off'>
          <Grid container>
            {this.Title()}
            {this.Documentation()}
            {this.Fields()}
            {this.Progress()}
            {this.Buttons()}
          </Grid>
        </form>
        {this.Status()}
        {this.Confirmation()}
      </Container>
    );
  }

  private Confirmation() {
    const button = this.state.pendingConfirmationButton;
    if (!button || !button.confirm) {
      return null;
    }

    return (
      <ConfirmationDialog
        open
        {...button.confirm(this.state.fields)}
        onConfirm={() => {
          this.setState({ pendingConfirmationButton: undefined });
          this.executeButtonAction(button);
        }}
        onCancel={() => this.setState({ pendingConfirmationButton: undefined })}
      />
    );
  }

  private getContainerMaxWidth(): 'xs' | 'sm' {
    // Phone: fields present single-column (getFieldRows collapses the layout), so the wider
    // sm cap — which exists only for multi-column rows — would just stretch lone fields.
    if (this.props.isPhone) {
      return 'xs';
    }

    if (this.props.fieldLayout) {
      // TODO validate that fields are not hidden
      if (this.props.fieldLayout.length < 2) {
        return 'xs';
      }

      for (const row of this.props.fieldLayout) {
        if ((row as string[]).length > 1) {
          return 'sm';
        }
      }
    } else {
      const rows: boolean[] = [];
      for (const fieldPropertyName in this.state.fields) {
        const field = this.state.fields[fieldPropertyName].field;
        if (field.accessibility?.hidden) {
          continue;
        }

        if (!field.layout) {
          continue;
        }

        if (rows[field.layout.row]) {
          return 'sm';
        }

        rows[field.layout.row] = true;
      }
    }

    return 'xs';
  }

  private Title() {
    if (!this.props.name) {
      return null;
    }

    return (
      <Grid
        container
        justifyContent='flex-start'
        alignItems='flex-start'
        sx={(theme) => ({
          marginTop: theme.spacing(1),
          marginBottom: theme.spacing(3),
        })}
      >
        <Grid item xs={12}>
          <Typography variant='h5'>{this.props.name}</Typography>
        </Grid>
      </Grid>
    );
  }

  private Documentation() {
    if (!this.props.documentation) {
      return null;
    }

    return (
      <Grid container justifyContent='flex-start' alignItems='flex-start'>
        {/* No nested Container: its default gutters misaligned this slot with the
            zero-gutter field grid (the same defect class the status toast fix removed). */}
        <Grid item xs={12}>
          <this.props.documentation />
        </Grid>
      </Grid>
    );
  }

  /**
   * Button results present as the house toast — a floating bottom-center Snackbar wrapping a
   * severity Alert — on both form factors. The previous inline Alert sat INSIDE the form card
   * (wrapped in a nested default-gutter Container, misaligned with the zero-gutter field grid)
   * and shifted the whole form down when it appeared.
   */
  private Status() {
    const status = this.state.status;
    const dismiss = () => this.setState({ status: {} });

    return (
      <Snackbar
        open={!!status?.message}
        autoHideDuration={status?.isError ? 6000 : 4000}
        onClose={(event, reason) => {
          // Clickaway must not dismiss: an error toast should outlive an incidental tap.
          if (reason === 'clickaway') {
            return;
          }
          dismiss();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={status?.isError ? 'error' : 'success'} onClose={dismiss}>
          {status?.message}
        </Alert>
      </Snackbar>
    );
  }

  private Fields() {
    return (
      <Grid container direction='column'>
        {this.getFieldRows().map((fieldComponents, index) => {
          if (!this.isFieldRowVisible(fieldComponents)) {
            return null;
          }

          return (
            <Grid
              container
              spacing={3}
              alignItems='center'
              data-form-field-row
              sx={(theme) => ({
                flexGrow: 1,
                marginBottom: theme.spacing(3),
              })}
              key={index}
            >
              {fieldComponents
                .filter((fieldComponent) => {
                  if (fieldComponent.field.accessibility?.hidden) {
                    return false;
                  }

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
    const rows = this.buildFieldRows();

    // Phone: single-column — every field takes its own full-width row, in layout order.
    // Multi-column rows exist for desktop scanning width; on a phone they compress fields
    // below usability and force horizontal overflow.
    if (this.props.isPhone) {
      const singleColumn: FieldComponent<any, any>[][] = [];
      for (const row of rows) {
        for (const fieldComponent of row) {
          singleColumn.push([fieldComponent]);
        }
      }

      return singleColumn;
    }

    return rows;
  }

  private buildFieldRows(): FieldComponent<any, any>[][] {
    const rows: FieldComponent<any, any>[][] = [];
    if (!this.state.fields) {
      return rows;
    }

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
          if (columns > 6) {
            throw new Error(
              `When using FormProps.fieldLayout, the maximum number of fields per row is 6, provided: ${columns}. For more granular layout control use Field.layout`
            );
          }

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
        if (!field.layout) {
          throw new Error(
            `Unless using FormProps.fieldLayout, Field.layout must be provided; layout not provided for field: ${field.name}`
          );
        }

        if (typeof rows[field.layout.row] === 'undefined') {
          rows[field.layout.row] = [];
        }

        if (field.layout.column && rows[field.layout.row].length >= field.layout.column) {
          rows[field.layout.row].splice(field.layout.column - 1, 0, fieldComponent);
        } else {
          rows[field.layout.row].push(fieldComponent);
        }

        const rowWidth = rows[field.layout.row]
          .map((fieldComponent) =>
            fieldComponent.field.layout?.width ? (fieldComponent.field.layout.width as number) : 0
          )
          .reduce((accumulator, currentWidth) => accumulator + currentWidth);
        if (rowWidth > 12) {
          throw new Error(
            `Width of row exceeds maximum width (12), row width: ${rowWidth}, row index: ${field.layout.row}`
          );
        }
      }
    }

    return rows;
  }

  private isFieldRowVisible(fieldComponents: FieldComponent<any, any>[]): boolean {
    for (const fieldComponent of fieldComponents) {
      if (!fieldComponent.field.accessibility || !fieldComponent.field.accessibility?.hidden) {
        return true;
      }
    }

    return false;
  }

  private Progress() {
    if (!this.state.progress || !this.state.progress.visible) {
      return null;
    }

    return (
      <Grid container xs={12} justifyContent='center' alignItems='center' spacing={2}>
        {/* Box, not Container: default Container gutters misaligned the bar with the field grid. */}
        <Box sx={{ width: '100%' }}>
          <LinearProgress variant='indeterminate' color='primary' />
        </Box>
      </Grid>
    );
  }

  private Buttons() {
    const visibleButtons = Object.keys(this.props.buttons)
      .map((buttonPropertyName) => this.props.buttons[buttonPropertyName])
      .filter((button) => !button.accessibility?.hidden);

    const buttonControl = (button: FormButton<F>, key: number) =>
      button.style.icon ? (
        <IconButton
          key={key}
          disabled={button.accessibility?.disabled || this.state.actionInFlight}
          onClick={(event: any) => this.onClick(button)}
        >
          <button.style.icon />
        </IconButton>
      ) : (
        <Button
          key={key}
          color={button.style.color}
          variant={button.style.variant || 'contained'}
          disabled={button.accessibility?.disabled || this.state.actionInFlight}
          onClick={(event) => this.onClick(button)}
        >
          {button.name}
        </Button>
      );

    // Phone: one wrapping action row. The desktop xs=6 halves give each side ~half a phone
    // screen — three buttons overflowed it. Left-aligned buttons keep their lead position;
    // gap replaces the per-button margin so wrapped lines stay aligned.
    if (this.props.isPhone) {
      return (
        <Grid
          container
          sx={(theme) => ({
            marginTop: theme.spacing(2),
            marginBottom: theme.spacing(1),
          })}
        >
          <Grid item xs={12}>
            <Stack
              direction='row'
              data-form-buttons
              sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}
            >
              {visibleButtons
                .filter((button) => button.style.align === 'left')
                .map((button, index) => buttonControl(button, index))}
              {visibleButtons
                .filter((button) => button.style.align !== 'left')
                .map((button, index) => buttonControl(button, visibleButtons.length + index))}
            </Stack>
          </Grid>
        </Grid>
      );
    }

    const leftAlignedButtons: JSX.Element[] = [];
    const rightAlignedButtons: JSX.Element[] = [];

    visibleButtons.forEach((button, index) => {
      const buttonElement = (
        <Grid
          key={index}
          sx={(theme) => ({
            marginLeft: theme.spacing(1),
          })}
        >
          {buttonControl(button, index)}
        </Grid>
      );

      if (button.style.align === 'left') {
        leftAlignedButtons.push(buttonElement);
      } else {
        rightAlignedButtons.push(buttonElement);
      }
    });

    return (
      <Grid
        container
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        sx={(theme) => ({
          marginTop: theme.spacing(2),
          marginBottom: theme.spacing(1),
        })}
      >
        <Grid item xs={6}>
          <Stack direction='row' spacing={1} justifyContent='flex-start'>
            {leftAlignedButtons}
          </Stack>
        </Grid>
        <Grid item xs={6}>
          <Stack direction='row' spacing={1} justifyContent='flex-end'>
            {rightAlignedButtons}
          </Stack>
        </Grid>
      </Grid>
    );
  }
}

type FormType = <F extends Fields, B extends FormButtons<F>>(props: Omit<FormProps<F, B>, 'classes'>) => JSX.Element;

/** Bridges the S1 form-factor hook into the class component (same shape as withRouter). */
const FormWithFormFactor = (props: any) => {
  const { isPhone } = useFormFactor();
  return <FormComponent isPhone={isPhone} {...props} />;
};

export const Form = withRouter(FormWithFormFactor as unknown as typeof React.Component) as FormType;
